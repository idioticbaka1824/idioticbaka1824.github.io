(() => {
    let drums = [];
	let piyoWaveSampleRate = 11025;
	let piyoDrumSampleRate = 22050;
	
	function clamp(number, min, max) {
		return Math.max(min, Math.min(number, max));
	}
	
	//utility function to read a bunch of data
	function getBytesLE(view, pos, n_bytes, unsigned) {
		out=[];
		for (let i=0; i<n_bytes; i++){
			out.push(unsigned == 'unsigned' ? view.getUint8(pos, true) : view.getInt8(pos, true));
			pos++;
		}
		out = new Int8Array(out);
		return out;
	}
	function get2BytesLE(view, pos, n_samples, unsigned) {
		out=[];
		for (let i=0; i<n_samples; i++){
			out.push(unsigned == 'unsigned' ? view.getUint16(pos, true) : view.getInt16(pos, true));
			pos+=2;
		}
		out = new Int16Array(out);
		return out;
	}

    class Song {
        /**
         * @param {ArrayBuffer} data 
         */
        constructor(data) {
            const view = new DataView(data);
            let p = 0;

            // PiyoPiyo-
            const isPiyo = view.getUint32(p, true); p += 4;
            if ((isPiyo).toString(16).slice(-6) != '444d50') { //"PMDx" where 'x' could be anything (wish there was a function to read 3 bytes)
                throw "Invalid magic.";
            }

            this.track1DataStartAddress = view.getUint32(p, true); p += 4;
			
			this.meas = [4, 4]; //I don't think piyopiyo allows for any other type
			
            this.wait = view.getUint32(p, true); p += 4;
			this.waitFudge = 1; //thought i'd need this but nah
            this.start = view.getInt32(p, true); p += 4;
            this.end = view.getInt32(p, true); p += 4;
            this.songLength = view.getInt32(p, true); p += 4; //upper bound on number of steps to play or consider

            this.instruments = [];

            for (let i = 0; i < 3; i++) {
                const baseOctave = view.getUint8(p, true); p++;
                const icon = view.getUint8(p, true); p++;
                const unknown = view.getUint16(p, true); p += 2;
                const envelopeLength = view.getUint32(p, true); p += 4;
                const volume = view.getUint32(p, true); p += 4;
                const unknown2 = view.getUint32(p, true); p += 4;
                const unknown3 = view.getUint32(p, true); p += 4;
				const waveSamples = getBytesLE(view, p, 256, 'signed'); p+=256;
				const envelopeSamples = getBytesLE(view, p, 64, 'signed'); p+=64;
                this.instruments[i] = { baseOctave, icon, envelopeLength, volume, waveSamples, envelopeSamples };
            }
			const drumVolume = view.getUint32(p, true); p+= 4; //0 to 300. 0 is still faintly audible
			this.instruments[3] = {volume:drumVolume, baseOctave:0}; //instruments[3], being the drum track, is qualitatively different from the others. handle it separately when needed
			console.log(this);
			//assert p == track1DataStartAddress at this point
			
            this.tracks = [];
            for (let i = 0; i < 4; i++) {
                const track = [];
                track.length = this.songLength;

                for (let j = 0; j < track.length; j++) {
                    track[j] = { keys:[], pan:0, pos:j };
                    let record = view.getUint32(p, true); p += 4;
					record = record.toString(2).padStart(32, '0');
					let bitfield = record.slice(-24); //24 binary digits of whether or note a note exists at that key (piyopiyo only supports a range of 2 octaves for any track)
					let keys = [];
					for (let key=0; key<bitfield.length; key++) {
						if (bitfield[key] == '1') keys.push(23-key);
					}
					track[j].keys = keys; //keys is an array of the pitch of all the notes at position j. values can be 0-23 (relative to baseOctave). note that in organya, keys.length could only be 1 (no overlapping notes)
					if(i==3){ //some drum frequencies are empty, if those notes exist then delete them
						let key=0;
						while(key<track[j].keys.length){
							if(drumTypeTable[track[j].keys[key]]==-1 || drumTypeTable[track[j].keys[key]]==undefined){ //some drum frequencies are empty
								track[j].keys.splice(key, 1);
							}
							key++;
						}
					}
					let pan = record.slice(0, 8);
					pan = parseInt(pan, 2);
					track[j].pan = pan;
				}

                this.tracks[i] = track;
            }
			
        }
    }

    const freqTable = [261, 278, 294, 311, 329, 349, 371, 391, 414, 440, 466, 494];
    const panTable = [256, 0, 86, 172, 256, 340, 426, 512]; //piyo has pan values 1 to 7, but '0' is also centred
    const advTable = [1, 1, 2, 2, 4, 8, 16, 32];
    const octTable = [32, 64, 64, 128, 128, 128, 128, 128];
	const drumTypeTable = [0,0,1,1,4,4,-1,-1,2,2,3,3,5,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]; //piyodrums.bin has some of the drums switched around

    class Organya {
        /**
         * @param {ArrayBuffer} data 
         */
        constructor(data) {
			this.isPlaying=false;
            this.song = new Song(data);
            this.MeasxStep=this.song.meas[0]*this.song.meas[1];
            this.node = null;
            this.onUpdate = null;
            this.t = 0;
            this.playPos = 0;
            this.samplesPerTick = 0;
            this.samplesThisTick = 0;
            this.state = [];
			
            this.mutedTracks = [];
            this.selectedTrack = 0;
			this.selectionStart = 0;
			this.selectionEnd = 0;
			this.editingMode = 0; //0 for pencil mode, 1 for duplicate mode
			this.recordsToPaste = []; //clipboard
			this.archives = []; //history for undo/redo
			this.isLoop = true;
			this.isLowSpec = false;
			this.isWaveformEditor = false;
			this.isEditingNumbers=-1; //which edit box is active for the numerical stuff in instrument editor? (0,1,2,3,4)=(volume, length, octave, size, wait)
            for (let i = 0; i < 4; i++) {
                this.state[i] = [
				{
                    t: [],
                    keys: [],
                    frequencies: [],
                    octaves: [],
                    pan: [],
                    vol: [],
                    length: [],
                    num_loops: 0,
                    playing: [],
                    looping: [],
                }
				];
            }
        }

        /**
         * @param {Float32Array} leftBuffer 
         * @param {Float32Array} rightBuffer
         */
        synth(leftBuffer, rightBuffer) {
            for (let sample = 0; sample < leftBuffer.length; sample++) {
                if (this.samplesThisTick == 0) this.update(); //update works in increments of song wait time, so anything finer than that is probably handled by this synth function

                leftBuffer[sample] = 0;
                rightBuffer[sample] = 0;

                for (let i = 0; i < 4; i++) {
					let i_prec=0;
					while (i_prec<this.state[i].length) { //prec stands for position record. a bundle of all the notes at a particular tick. idk why i called it that. the reason organya didn't have this is cuz in piyopiyo each note can last long enough to meld into upcoming ones
						for(let i_note=0; i_note<this.state[i][i_prec].keys.length; i_note++) {
							if (this.state[i][i_prec].playing[i_note]) {
								
								const samples = (i < 3) ? 256 : drumWaveTable[drumTypeTable[this.state[i][i_prec].keys[i_note]]].length;

								this.state[i][i_prec].t[i_note] += (this.state[i][i_prec].frequencies[i_note] / this.sampleRate) * advTable[this.state[i][i_prec].octaves[i_note]];

								if ((this.state[i][i_prec].t[i_note] | 0) >= samples) { // using == instead of >= will hurt your ears
									if (this.state[i][i_prec].looping[i_note] && this.state[i][i_prec].num_loops >= 1) {
										this.state[i][i_prec].t[i_note] %= samples;
										if (this.state[i][i_prec].num_loops >= 1)
											this.state[i][i_prec].num_loops -= 0; //what? what was this for and why does it seem to be unnecessary now?

									} else {
										this.state[i][i_prec].t[i_note] = 0;
										this.state[i][i_prec].playing[i_note] = false;
										continue;
									}
								}

								const t = this.state[i][i_prec].t[i_note] & ~(advTable[this.state[i][i_prec].octaves[i_note]] - 1);
								let pos = t % samples;
								let pos2 = !this.state[i][i_prec].looping[i_note] && t == samples ?
									pos
									: ((this.state[i][i_prec].t[i_note] + advTable[this.state[i][i_prec].octaves[i_note]]) & ~(advTable[this.state[i][i_prec].octaves[i_note]] - 1)) % samples;
								const s1 = i < 3
									? (this.song.instruments[i].waveSamples[pos] / 256) //wave and drum samples go -100 to 100. not sure if it's still appropriate to divide by 256, since idk what organya sample range was
									: ((drumWaveTable[drumTypeTable[this.state[i][i_prec].keys[i_note]]][pos] ) / 256);
								const s2 = i < 3
									? (this.song.instruments[i].waveSamples[pos2] / 256)
									: ((drumWaveTable[drumTypeTable[this.state[i][i_prec].keys[i_note]]][pos2] ) / 256);
								const fract = (this.state[i][i_prec].t[i_note] - pos) / advTable[this.state[i][i_prec].octaves[i_note]];

								// perform linear interpolation
								let s = s1 + (s2 - s1) * fract;

								//envelope volume stuff
								let fractionOfThisNoteCompleted = 1 - (this.state[i][i_prec].length[i_note] - this.samplesThisTick/this.sampleRate)/(this.song.instruments[i].envelopeLength/(piyoWaveSampleRate));
								let volumeEnv=1;
								if (fractionOfThisNoteCompleted>1) {volumeEnv=0;} //in case we're in that little bit of overshoot because of the ticks not lining up with envelope lengths
								else {volumeEnv = (i<3) ? this.song.instruments[i].envelopeSamples[(fractionOfThisNoteCompleted*63 | 0)]/128 : 1-0.4*(this.state[i][i_prec].keys[i_note]%2==1);} //envelope samples go 0-128. also, odd-key drums are softer. the 0.4 factor is eyeballed
								
								s *= Math.pow(10, ((this.state[i][i_prec].vol[i_note] - 300) * 8)/2000);
								//s *= Math.pow(10, 1.2*this.state[i][i_prec].vol[i_note]/300 - 1.45) //my messy calculation that i turned out not to need when i figured out how the envelope works
								s *= volumeEnv; //why didn't i realise this right away i'm so stupid
								
								const pan = (panTable[this.state[i][i_prec].pan[i_note]] - 256) * 10;
								let left = 1, right = 1;

								if (pan < 0) {
									right = Math.pow(10, pan / 2000);
								} else if (pan > 0) {
									left = Math.pow(10, -pan / 2000);
								}

								leftBuffer[sample] += s * left;
								rightBuffer[sample] += s * right;
							}
						}
					i_prec++;
					}
                }

                if (++this.samplesThisTick == this.samplesPerTick) {
                    this.playPos += 1;
                    this.updateTimeDisplay();
                    this.samplesThisTick = 0;

                    if (this.playPos >= this.song.end) {
						if (this.isLoop == true) {
							this.playPos = this.song.start;
							this.updateTimeDisplay();
						}
						else if (this.isLoop == false) {
							this.pause();
						}
                    }
                }
            }
        }
        
        homeOrg() {
			this.pause();
			this.playPos = 0;
            this.updateTimeDisplay();
        }
        
        backMeas() {
            if (this.playPos-(this.MeasxStep+this.playPos%this.MeasxStep)>=0){
                this.playPos-=(this.MeasxStep+this.playPos%this.MeasxStep);
            }
            this.updateTimeDisplay();
        }
        
        nextMeas() {
            this.playPos+=(this.MeasxStep-this.playPos%this.MeasxStep); //to go to beginning of next measure
            this.updateTimeDisplay();
        }
		
		cursorUpdate(x) {
			let viewPos = (this.playPos/this.MeasxStep | 0)*this.MeasxStep;
			let newPlayPosOffset = ((x-36)/12 | 0); //offset (in beats) from viewpos (the beat # of the beginning of the viewing window)
            this.playPos = viewPos + newPlayPosOffset;
			this.selectionStart = this.playPos;
			this.selectionEnd = this.selectionStart;
            this.updateTimeDisplay();
        }
		
		selectionUpdate(x) {
			let viewPos = (this.playPos/this.MeasxStep | 0)*this.MeasxStep;
			let newSelectionEndOffset = ((x-36)/12 | 0); //offset (in beats) from viewpos (the beat # of the beginning of the viewing window)
            this.selectionEnd = viewPos + newSelectionEndOffset;
			if (this.selectionEnd > this.song.songLength) this.selectionEnd = this.song.songLength;
            this.updateTimeDisplay();
        }
		
		addNote(x, y, scrollY) {
			let viewPos = (this.playPos/this.MeasxStep | 0)*this.MeasxStep;
			let newNotePos = viewPos + ((x-36)/12 | 0);
			let newNoteKey = (96 - ((y + scrollY)/12) | 0);
			let newNoteKeyRelative = newNoteKey % 12;
			let newNoteKeyOctave = (newNoteKey / 12 | 0);
			let toPush = newNoteKeyRelative + 12*(newNoteKeyOctave-this.song.instruments[this.selectedTrack].baseOctave)
			var keys = this.song.tracks[this.selectedTrack][newNotePos].keys
			if (keys.includes(toPush)) keys.splice(keys.indexOf(toPush), 1);
			else if((this.selectedTrack!=3) || (drumTypeTable[newNoteKeyRelative]!=-1 && drumTypeTable[newNoteKeyRelative]!=undefined)) keys.push(toPush);
			if (this.onUpdate) this.onUpdate(this);
		}
		
		deleteNotes() {
			for(let i=Math.min(this.selectionStart, this.selectionEnd); i<Math.max(this.selectionStart, this.selectionEnd); i++) {
				this.song.tracks[this.selectedTrack][i].keys=[];
				this.song.tracks[this.selectedTrack][i].pan=0;
			}
			if (this.onUpdate) this.onUpdate(this);
		}
		
		copyNotes() {
			this.recordsToPaste = [];
			let selectionStart = Math.min(this.selectionStart, this.selectionEnd);
			let selectionEnd = Math.max(this.selectionStart, this.selectionEnd);
			for(let i=0; i<selectionEnd-selectionStart; i++) {
				let recordToPaste = {keys:[], pan:0};
				recordToPaste.keys = this.song.tracks[this.selectedTrack][selectionStart+i].keys.slice();
				recordToPaste.pan = this.song.tracks[this.selectedTrack][selectionStart+i].pan;
				this.recordsToPaste.push(recordToPaste);
			}
		}
		pasteNotes(x, y) {
			let viewPos = (this.playPos/this.MeasxStep | 0)*this.MeasxStep;
			let newNotePos = viewPos + ((x-36)/12 | 0);
			if(x==-1 && y==-1) newNotePos = this.playPos; //if ctrl+v instead of mouseclick, paste at playPos
			for(let i=0; i<this.recordsToPaste.length; i++) {
				this.song.tracks[this.selectedTrack][newNotePos+i].keys = this.recordsToPaste[i].keys.slice();
				this.song.tracks[this.selectedTrack][newNotePos+i].pan = this.recordsToPaste[i].pan;
			}
			if (this.onUpdate) this.onUpdate(this);
		}
		
		addPan(x, y, height) {
			let viewPos = (this.playPos/this.MeasxStep | 0)*this.MeasxStep;
			let newPanPos = viewPos + ((x-36)/12 | 0);
			let newPanVal = ((height-y-76)/12 | 0)+1;
			this.song.tracks[this.selectedTrack][newPanPos].pan = newPanVal;
			if (this.onUpdate) this.onUpdate(this);
		}
		
		changeTrack(x, click) {
			let newSelectedTrack = (x/64 | 0);
			if(click==0) this.selectedTrack = newSelectedTrack;
			else if(click==2) {
				var inputElements = document.getElementsByClassName('mute');
				inputElements[newSelectedTrack].checked=1-inputElements[newSelectedTrack].checked;
			}
			if (this.onUpdate) this.onUpdate(this);
		}
        
		changeEditingMode(argument) {
			this.editingMode=argument;
			if (this.onUpdate) this.onUpdate(this);
		};
		
		changeLoop() {
			this.isLoop = 1-this.isLoop;
			if (this.onUpdate) this.onUpdate(this);
		}
		changeLowSpec() {
			this.isLowSpec = 1-this.isLowSpec;
			if (this.onUpdate) this.onUpdate(this);
		}
		
		toggleWaveformEditor() {
			this.pause();
			this.isWaveformEditor = 1-this.isWaveformEditor;
			this.isEditingNumbers *= -1;
			if (this.onUpdate) this.onUpdate(this);
		}
		
		updateNoteIcon(x, y) {
			x -= 64;
			y -= 274;
			let iconID = (x/12 | 0) + 10*(y/12 | 0);
			this.song.instruments[this.selectedTrack].icon = iconID;
			if (this.onUpdate) this.onUpdate(this);
		}
		
		editWaveSamples(x, y) {
			let newPos = ((x-64)/2 | 0);
			let newSample = 156-y;
			this.song.instruments[this.selectedTrack].waveSamples[newPos] = newSample;
			if (this.onUpdate) this.onUpdate(this);
		}
		editEnvelopeSamples(x, y) {
			let newPos = ((x-320)/4 | 0);
			let newSample = 402-y;
			this.song.instruments[this.selectedTrack].envelopeSamples[newPos] = newSample;
			if (this.onUpdate) this.onUpdate(this);
		}
		editNumbers(newValueInput, fromKeyboard=0) { //this is such a mess ;_;
			if(this.isEditingNumbers!=-1 && newValueInput!==null && newValueInput!=='') {
				const minValues = [1, 40, 0, 16, 20];
				const maxValues = [300, 44100, 5, 4096, 1000];
				let newValue = Math.max(newValueInput, minValues[this.isEditingNumbers]);
				newValue = clamp(newValueInput, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
				switch (this.isEditingNumbers) {
					case 0:
						this.song.instruments[this.selectedTrack].volume = (fromKeyboard==0) ? newValue : clamp(this.song.instruments[this.selectedTrack].volume + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
					case 1:
						this.song.instruments[this.selectedTrack].envelopeLength = (fromKeyboard==0) ? newValue : clamp(this.song.instruments[this.selectedTrack].envelopeLength + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
					case 2:
						this.song.instruments[this.selectedTrack].baseOctave = (fromKeyboard==0) ? newValue : clamp(this.song.instruments[this.selectedTrack].baseOctave + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
					case 3:
						this.song.songLength = (fromKeyboard==0) ? newValue : clamp(this.song.songLength + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
					case 4:
						this.song.wait = (fromKeyboard==0) ? newValue : clamp(this.song.wait + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
				}
				if (this.onUpdate) this.onUpdate(this);
			}
		}
		
		// undo() {
		// }
		// redo() {
		// }
        
        updateTimeDisplay() {
            currentMeasDisplay.innerHTML=this.playPos/(this.MeasxStep) | 0;
            currentStepDisplay.innerHTML=this.playPos%(this.MeasxStep);
            if (this.onUpdate) this.onUpdate(this); //this line is so as to update the display when next/previous is pressed, even when not playing
        }
        
        update() {
            if (this.onUpdate) this.onUpdate(this);
            
			if (this.playPos>=this.song.end && this.isLoop) this.playPos=this.song.start;
			
            this.whichMuted();

            for (let track = 0; track < 4; track++) { //melody (non-drum) tracks
                if (!(this.mutedTracks.includes(track))) {
					//const record = this.song.tracks[track].find((n) => n.pos == this.playPos); //why do all this? don't we just want the pos-th item in the track? or were empty positions not stored with an empty track item, thus necessitating storing pos info in each track item? i don't think i'm doing that here
					const record = this.song.tracks[track][this.playPos];
					if (record.keys.length != 0) { //only continue if there is some or the other note at that position
						let keys = record.keys;
						this.state[track].push({t: [], keys: [], frequencies: [], octaves: [], pan: [], vol: [], length: [], num_loops: 0, playing: [], looping: [] });
						let lastIndex = this.state[track].length-1;	
						for (let i_note=0; i_note<record.keys.length; i_note++) { //iterate over all the notes in the track at one particular position (this was unnecessary in organya)

								const octave = ((keys[i_note] / 12) | 0)*(track!=3) + this.song.instruments[track].baseOctave;
								const key = keys[i_note] % 12;
								const frequencyToPush = track < 3 ? freqTable[key] * octTable[octave] : piyoDrumSampleRate; //the piyoDrumSampleRate value was pretty much titrated, and now i'm realising like oh okay so frequency's in samples per second, not cycles or radians
								//const frequencyToPush = 8363*Math.pow(2, octave + key/12);
								
								this.state[track][lastIndex].keys.push(track<3 ? key : keys[i_note]); //keeping a 0-24 range for the drums since otherwise the highest drums sounds like the lowest ones
								this.state[track][lastIndex].t.push(0);

								this.state[track][lastIndex].frequencies.push(frequencyToPush);
								if (!this.state[track][lastIndex].playing[i_note]) {
									this.state[track][lastIndex].num_loops = ((octave + 1) * 4); //what does this do?
								}
								
								if (!this.state[track][lastIndex].playing[i_note]) {
									this.state[track][lastIndex].num_loops = ((octave + 1) * 4);
								}

								this.state[track][lastIndex].octaves.push(octave);
								this.state[track][lastIndex].playing.push(true);
								this.state[track][lastIndex].looping.push(track!=3);
								this.state[track][lastIndex].length.push( (track<3) ? (this.song.instruments[track].envelopeLength/piyoWaveSampleRate) : drumWaveTable[drumTypeTable[this.state[track][lastIndex].keys[i_note]]].length/piyoDrumSampleRate); //in seconds. not sure why i'm using different sample rates, but it seems to work?


							if (this.state[track][lastIndex].keys.length >0) {
								this.state[track][lastIndex].vol.push(this.song.instruments[track].volume); //piyo doesn't allow changing volume mid-track, but drums can have different volumes and we don't want those overlapping
								this.state[track][lastIndex].pan.push(record.pan);
							}
						} //ending the 'skip muted tracks' if-block here, rather than at the end, because otherwise, muting while a note played would make that note get stuck
					}
				}
				let i_prec=0;
				while (i_prec<this.state[track].length){
					for(let i_note=0; i_note<this.state[track][i_prec].keys.length; i_note++){
						if (this.state[track][i_prec].length[i_note] <= 0) { //the length of a note isn't necessarily an integer multiple of a tick length in piyo, so this was running into negatives. figure out how to fix this. maybe go to the playback function and use length in terms of seconds instead? yeah that worked out i guess
							this.state[track][i_prec].frequencies.splice(i_note, 1);
							this.state[track][i_prec].keys.splice(i_note, 1);
							this.state[track][i_prec].octaves.splice(i_note, 1);
							this.state[track][i_prec].length.splice(i_note, 1);
							this.state[track][i_prec].t.splice(i_note, 1);
							this.state[track][i_prec].playing.splice(i_note, 1);
							this.state[track][i_prec].looping.splice(i_note, 1);
							this.state[track][i_prec].pan.splice(i_note, 1);
							this.state[track][i_prec].vol.splice(i_note, 1);
						}
						else {
							this.state[track][i_prec].length[i_note] -= this.song.wait*this.song.waitFudge/1000;
						}
					}
					if(this.state[track][i_prec].length.length==0) {this.state[track].splice(i_prec, 1);}
					i_prec++;
				}
            }
        }

        stop() {
			this.isPlaying=false;
			if(this.ctx.state!='closed') {
				this.node.disconnect();
				this.ctx.close();
			}
        }
        
        pause() {
			this.isPlaying=false;
			this.node.disconnect();
			for(let track=0; track<4; track++){
				this.state[track]=[{t: [], keys: [], frequencies: [], octaves: [], pan: [], vol: [], length: [], num_loops: 0, playing: [], looping: []}];
            }//flushing the envelopes out so pressing home and replaying doesn't have a leftover of where you stopped
        }

        play(argument) {
			this.isPlaying = true;
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.sampleRate = this.ctx.sampleRate;
            this.samplesPerTick = (this.sampleRate / 1000) * this.song.wait*this.song.waitFudge | 0;
            this.samplesThisTick = 0;

            this.node = this.ctx.createScriptProcessor(8192, 0, 2);
            
            if(argument=='doPlay'){ //the point of this bit is to change the display as soon as a new org is selected
                this.node.onaudioprocess = (e) => this.synth(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1));
                this.node.connect(this.ctx.destination);
            }
        }
        
        whichMuted() {
            var checkedValues = [];
            var inputElements = document.getElementsByClassName('mute');
            for(var i=0; inputElements[i]; ++i){
                if(inputElements[i].checked){
                    checkedValues.push(Number(inputElements[i].value));
                }
            }
            this.mutedTracks=checkedValues;
        }
    }

    window.initOrganya = async () => {
        if (window.Organya) return;
        
        //splitting waves and drums into separate wavetables
        
        console.log("Initializing PiyoPiyo...");
        
		const drumURL = new URL("https://raadshaikh.github.io/music/piyopiyo-js/piyoDrums.bin");
        const res_d = await fetch(drumURL); //'_d' for 'drum'. Beyond that, code is unchanged
        const buf_d = await res_d.arrayBuffer();
        const view_d = new DataView(buf_d);
        drumWaveTable = new Int16Array(buf_d);
		drumWaveTable = [];
		
		let i = 0;
        while (drums.length < 6) {
			const drumfile_offset = i;
			const wavLen = view_d.getUint32(i, false); i += 4; //wavLen is in bytes. each sample is 2 bytes, though
			drumWaveTable.push(get2BytesLE(view_d, i, wavLen/2, 'unsigned'));
			drums.push({ filePos: drumfile_offset, samples: wavLen/2 });
			i += wavLen;
        }
		for (let i=0; i<6; i++){  //getting it into -100 to 100 range, like melody samples
			for (let j=0; j<drumWaveTable[i].length; j++){
				drumWaveTable[i][j] = drumWaveTable[i][j]*100/32768;
			}
		}
		
		
		/* //utility function for downloading the drum samples separately for testing
		let toDownload = [];
		for (let i=0; i<drumWaveTable[5].length; i++){
			toDownload.push(drumWaveTable[5][i]);
		}
		
		const downloadURL = (data, fileName) => {
		  const a = document.createElement('a')
		  a.href = data
		  a.download = fileName
		  document.body.appendChild(a)
		  a.style.display = 'none'
		  a.click()
		  a.remove()
		}

		const downloadBlob = (data, fileName, mimeType) => {

		  const blob = new Blob([data], {
			type: mimeType
		  })

		  const url = window.URL.createObjectURL(blob)

		  downloadURL(url, fileName)

		  setTimeout(() => window.URL.revokeObjectURL(url), 1000)
		}

		//downloadBlob(toDownload, 'drum5.bin', 'application/octet-stream');
		*/
		
        window.Organya = Organya;
    };
})();