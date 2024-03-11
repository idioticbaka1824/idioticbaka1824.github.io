(() => {
    let waveTable = new Int8Array(new ArrayBuffer(0));
    let drums = [];
	
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
            this.start = view.getInt32(p, true); p += 4;
            this.end = view.getInt32(p, true); p += 4;
            this.songLength = view.getInt32(p, true); p += 4; //upper bound on number of steps to play or consider

            this.instruments = [];

            for (let i = 0; i < 3; i++) {
                const baseOctave = view.getUint8(p, true); p++;
                const icon = view.getUint8(p, true); p++;
                const unknown = view.getUint16(p, true); p += 2;
                const envelopeLength = view.getUint32(p, true); p += 4; //11025 is 1 second	
                const volume = view.getUint32(p, true); p += 4;
                const unknown2 = view.getUint32(p, true); p += 4;
                const unknown3 = view.getUint32(p, true); p += 4;
				const waveSamples = getBytesLE(view, p, 256, 'signed'); p+=256;
				const envelopeSamples = getBytesLE(view, p, 64, 'signed'); p+=64;
                this.instruments[i] = { baseOctave, icon, envelopeLength, volume, waveSamples, envelopeSamples, freq:1000 };
            }
			const drumVolume = view.getUint32(p, true); p+= 4; //0 to 300. 0 is still faintly audible
			this.instruments[3] = {volume:drumVolume, baseOctave:0, waveSamples:this.instruments[0].waveSamples, envelopeLength:11025}; //instruments[3], being the drum track, is qualitatively different from the others. handle it separately when needed
			console.log(this.instruments);
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
					let pan = record.slice(0, 8);
					pan = parseInt(pan, 2);
					track[j].pan = pan;
				}

                this.tracks[i] = track;
            }
			
        }
    }

    const freqTable = [261, 278, 294, 311, 329, 349, 371, 391, 414, 440, 466, 494];
    //const panTable = [0, 43, 86, 129, 172, 215, 256, 297, 340, 383, 426, 469, 512];
    const panTable = [256, 0, 86, 172, 256, 340, 426, 512]; //piyo has pan values 1 to 7, but '0' is also centred
    const advTable = [1, 1, 2, 2, 4, 8, 16, 32];
    const octTable = [32, 64, 64, 128, 128, 128, 128, 128];
	const drumTypeTable = [0,0,1,1,2,2,-1,-1,3,3,4,4,5,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1];

    class Organya {
        /**
         * @param {ArrayBuffer} data 
         */
        constructor(data) {
            this.song = new Song(data);
            this.MeasxStep=this.song.meas[0]*this.song.meas[1];
            this.node = null;
            this.onUpdate = null;
            this.t = 0;
            this.playPos = 0;
            this.samplesPerTick = 0;
            this.samplesThisTick = 0;
            this.state = [];
            this.mutedTracks=[];
            this.selectedTrack=0;
            for (let i = 0; i < 4; i++) {
                this.state[i] = {
                    t: [],
                    keys: [],
                    frequencies: [],
                    octaves: [],
                    pan: 0.0,
                    vol: 1.0,
                    length: 0,
                    num_loops: 0,
                    playing: false,
                    looping: false,
                };
            }
        }

        /**
         * @param {Float32Array} leftBuffer 
         * @param {Float32Array} rightBuffer
         */
        synth(leftBuffer, rightBuffer) {
            for (let sample = 0; sample < leftBuffer.length; sample++) {
                if (this.samplesThisTick == 0) this.update(); //update works in increments of song wait time, so anything finer than that must be handled by this synth function

                leftBuffer[sample] = 0;
                rightBuffer[sample] = 0;

                for (let i = 0; i < 4; i++) {
					for(let i_note=0; i_note<this.state[i].keys.length; i_note++) {
						if (this.state[i].playing) {
							//console.log(this.state);
							const samples = (i < 3+1) ? 256 : drums[drumTypeTable[this.state[i].keys[i_note]]].samples;

							this.state[i].t[i_note] += (this.state[i].frequencies[i_note] / this.sampleRate) * advTable[this.state[i].octaves[i_note]];

							if ((this.state[i].t[i_note] | 0) >= samples) { // using == instead of >= will hurt your ears
								if (this.state[i].looping && this.state[i].num_loops >= 1) {
									this.state[i].t[i_note] %= samples;
									if (this.state[i].num_loops >= 1)
										this.state[i].num_loops -= 0;

								} else {
									this.state[i].t[i_note] = 0;
									this.state[i].playing = false;
									continue;
								}
							}

							const t = this.state[i].t[i_note] & ~(advTable[this.state[i].octaves[i_note]] - 1);
							let pos = t % samples;
							let pos2 = !this.state[i].looping && t == samples ?
								pos
								: ((this.state[i].t[i_note] + advTable[this.state[i].octaves[i_note]]) & ~(advTable[this.state[i].octaves[i_note]] - 1)) % samples;
							const s1 = i < 3+1
								? (this.song.instruments[i].waveSamples[pos] / 256)
								: ((drumWaveTable[drumTypeTable[this.state[i].keys[i_note]]][pos] ) / 256);
							const s2 = i < 3+1
								? (this.song.instruments[i].waveSamples[pos2] / 256)
								: ((drumWaveTable[drumTypeTable[this.state[i].keys[i_note]]][pos2] ) / 256);
							const fract = (this.state[i].t[i_note] - pos) / advTable[this.state[i].octaves[i_note]];

							// perform linear interpolation
							let s = s1 + (s2 - s1) * fract;

							//envelope volume stuff
							const fractionOfThisNoteCompleted = t/(this.sampleRate*this.song.instruments[i].envelopeLength/11025);
							const volumeMultiplier = this.song.instruments[i].envelopeSamples[(fractionOfThisNoteCompleted*64 | 0)]/128;

							s *= Math.pow(10, ((this.state[i].vol*volumeMultiplier - 255) * 8) / 2000);
							//console.log(this.state[i]);

							const pan = (panTable[this.state[i].pan] - 256) * 10;
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
                }

                if (++this.samplesThisTick == this.samplesPerTick) {
                    this.playPos += 1;
                    this.updateTimeDisplay();
                    this.samplesThisTick = 0;

                    if (this.playPos >= this.song.end) {
                        this.playPos = this.song.start;
                        this.updateTimeDisplay();
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
			let viewPos = ~~(this.playPos/this.MeasxStep)*this.MeasxStep;
			let newPlayPosOffset = ~~((x-36)/12); //offset from viewpos (the beginning of the viewing window)
            this.playPos = viewPos + newPlayPosOffset;
            this.updateTimeDisplay();
        }
		
		addNote(x, y, scrollY) {
			let viewPos = ~~(this.playPos/this.MeasxStep)*this.MeasxStep;
			let newNotePos = viewPos + ~~((x-36)/12);
			let newNoteKey = (96 - ((y + scrollY)/12) | 0);
			let newNoteKeyRelative = newNoteKey % 12;
			let newNoteKeyOctave = (newNoteKey / 12 | 0);
			let toPush = newNoteKeyRelative + 12*(newNoteKeyOctave-this.song.instruments[this.selectedTrack].baseOctave)
			var keys = this.song.tracks[this.selectedTrack][newNotePos].keys
			if (keys.includes(toPush)) keys.splice(keys.indexOf(toPush), 1);
			else keys.push(toPush);
			this.update();
		}
        
        
        updateTimeDisplay() {
            currentMeasDisplay.innerHTML=this.playPos/(this.MeasxStep) | 0;
            currentStepDisplay.innerHTML=this.playPos%(this.MeasxStep);
            this.update(); //this line is so as to update the display when next/previous is pressed, even when not playing
        }
        
        update() {
            if (this.onUpdate) this.onUpdate(this);
            
			if (this.playPos>=this.song.end) this.playPos=this.song.start;
			
            this.whichMuted();

            for (let track = 0; track < 3; track++) { //melody (non-drum) tracks
                if (!(this.mutedTracks.includes(track))) {
					//const record = this.song.tracks[track].find((n) => n.pos == this.playPos); //why do all this? don't we just want the pos-th item in the track? or were empty positions not stored with an empty track item, thus necessitating storing pos info in each track item? i don't think i'm doing that here
					const record = this.song.tracks[track][this.playPos];
					if (record.keys.length != 0) { //only continue if there is some or the other note at that position
						let keys = record.keys;
						for (let i_note=0; i_note<record.keys.length; i_note++) { //iterate over all the notes in the track at one particular position (this was unnecessary in organya)
							if (keys[i_note] != 255) {
								const octave = ((keys[i_note] / 12) | 0) + this.song.instruments[track].baseOctave;
								const key = keys[i_note] % 12;
								const frequencyToPush = freqTable[key] * octTable[octave];
								//const frequencyToPush = 8363*Math.pow(2, octave + key/12);
								
								if (this.state[track].keys.length == 0) {
									this.state[track].keys.push(key);
									this.state[track].t.push(0);

									this.state[track].frequencies.push(frequencyToPush);
									if (!this.state[track].playing) {
										this.state[track].num_loops = ((octave + 1) * 4);
									}
								} else if (this.state[track].keys[i_note] != key) {
									this.state[track].keys[i_note] = key;
									this.state[track].frequencies.push(frequencyToPush);
									this.state[track].t[i_note]=0;
								}

								if (!this.state[track].playing) {
									this.state[track].num_loops = ((octave + 1) * 4);
								}

								this.state[track].octaves[i_note] = octave;
								this.state[track].playing = true;
								this.state[track].looping = true;
								this.state[track].length = (this.song.instruments[track].envelopeLength/11025); //in seconds
							}

							if (this.state[track].keys.length >0) {
								//if (this.song.instruments[track].vol != 255) this.state[track].vol = this.song.instruments[track].volume;
								if (this.song.instruments[track].vol != 255) this.state[track].vol = this.song.instruments[track].volume; //piyo doesn't allow changing volume mid-note
								if (record.pan != 255) this.state[track].pan = record.pan;
							}
						} //ending the 'skip muted tracks' if-block here, rather than at the end, because otherwise, muting while a note played would make that note get stuck
					}
				}
				//for (let i_note=0; i_note<this.state[track].keys.length; i_note++){
					if (this.state[track].length <= 0) { //the length of a note isn't necessarily an integer multiple of a step's length in piyo, so this was running into negatives. figure out how to fix this. maybe go to the playback function and use length in terms of seconds instead?
						if (this.state[track].keys.length>0) {
							this.state[track].looping = false;
							this.state[track].playing = false;
							this.state[track].keys = [];
							this.state[track].frequencies = [];
							this.state[track].octaves = [];
							this.state[track].pan = 0;
							this.state[track].vol = 1;
							this.state[track].length = 0; //otherwise it seemed to be getting stuck on negatives
							this.state[track].num_loops = 0;
						}
					}
					else {
						this.state[track].length -= this.song.wait;
					}
				//}
            }

            for (let track = 3; track < 4; track++) { //looks dumb, yeah. piyopiyo has only one drum track but it's easier to just leave it like this
                if (!(this.mutedTracks.includes(track))) {
					const record = this.song.tracks[track][this.playPos];
					let keys = record.keys;
					if (record.keys.length == 0) continue;
					for (let i_note=0; i_note<record.keys.length; i_note++) {
						if (keys[i_note] != 255) {
							
							
								const octave = ((keys[i_note] / 12) | 0) + this.song.instruments[track].baseOctave;
								const key = keys[i_note] % 12;
								const frequencyToPush = freqTable[key] * octTable[octave];
							
							//this.state[track].frequencies[i_note] = keys[i_note] * 800 + 100;
							this.state[track].frequencies.push(frequencyToPush); //not sure what frequency to put for drums, since while it's not really applicable, it also affects sample rate or something later. I'll go with middle C for now
							//if (drumTypeTable[keys[i_note]]!=-1) this.state[track].keys.push(keys[i_note]);
							this.state[track].t[i_note] = 0;
							this.state[track].playing = true;
						}

						if (this.song.instruments[track].vol != 255) this.state[track].vol = this.song.instruments[track].volume;
						if (record.pan != 255) this.state[track].pan = record.pan;
					}
				}
			}
        }

        stop() {
			if(this.ctx.state!='closed') {
				this.node.disconnect();
				this.ctx.close();
			}
        }
        
        pause() {
			this.node.disconnect();
        }

        play(argument) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.sampleRate = this.ctx.sampleRate;
            this.samplesPerTick = (this.sampleRate / 1000) * this.song.wait | 0;
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
        
        console.log("Initializing Organya...");
		const waveURL = new URL("https://raadshaikh.github.io/music/piyopiyo-js/WAVE100.bin");
        const res = await fetch(waveURL);
        const buf = await res.arrayBuffer();
        const view = new DataView(buf);
        waveTable = new Int8Array(buf);
        
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
        window.Organya = Organya;
    };
})();