(() => {
    class OrganyaUI {
        /**
         * @param {HTMLCanvasElement} canvas 
         */
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext("2d");
			//this.ctx.scale(2,2); //could make a zoom option sometime
			//this.ctx.imageSmoothingEnabled = false;
            this.organya = null;
            this.requested = false;
            this.scrollY = 8 * 144 - this.canvas.height;

            this.canvas.addEventListener("wheel", this.onScroll.bind(this));
            if ("ontouchstart" in window) {
                this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
                this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this));
                this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
            }
            

            this.noteImg = new Image();
            this.noteImg.src = "GUI/note.png";
            this.noteImg.addEventListener("load", this.onImageLoad.bind(this));
            this.pianoRoll = new Image();
            this.pianoRoll.src = "GUI/music.png";
            this.pianoRoll.addEventListener("load", this.onImageLoad.bind(this));
            this.number = new Image();
            this.number.src = "GUI/figure.png";
            this.number.addEventListener("load", this.onImageLoad.bind(this));
            this.cursor = new Image();
            this.cursor.src = "GUI/cursor.png";
            this.cursor.addEventListener("load", this.onImageLoad.bind(this));
            this.piyo = new Image();
            this.piyo.src = "GUI/piyo.png";
            this.piyo.addEventListener("load", this.onImageLoad.bind(this));
            this.setting = new Image();
            this.setting.src = "GUI/setting.png";
            this.setting.addEventListener("load", this.onImageLoad.bind(this));
            this.buttons = new Image();
            this.buttons.src = "GUI/buttons.png";
            this.buttons.addEventListener("load", this.onImageLoad.bind(this));
            this.check = new Image();
            this.check.src = "GUI/check.png";
            this.check.addEventListener("load", this.onImageLoad.bind(this));
        }
        
        
        onTouchStart(e) {
            this.touching = true;
            this.touchX = e.touches[0].pageX;
            this.touchY = e.touches[0].pageY;
        }

        onTouchMove(e) {
            if (this.touching) {
                e.preventDefault();
                //const offX = this.touchX - e.touches[0].pageX;
                const offY = this.touchY - e.touches[0].pageY;
                this.touchX = e.touches[0].pageX;
                this.touchY = e.touches[0].pageY;

                this.onScroll({ deltaY: offY });
            }
        }

        onTouchEnd() {
            this.touching = false;
            this.touchX = 0;
            this.touchY = 0;
        }

        onScroll(e) {
            this.scrollY += e.deltaY;
            this.onUpdate();
        }
        

        onImageLoad() {
            if (this.noteImg.complete && this.pianoRoll.complete && this.number.complete && this.cursor.complete && this.piyo.complete && this.setting.complete && this.buttons.complete && this.check.complete) {
                this.onUpdate();
            }
        }

        /**
         * Sets the reference to Organya player used by this instance of renderer.
         * @param {Organya} organya 
         */
        setOrganya(organya) {
            this.organya = organya;
            this.organya.onUpdate = this.draw.bind(this);
        }

        drawNumber(x, y, number, zeroPad = 0, white = false, rtl=false) {
            let str = number.toString();
            while (str.length < zeroPad) {
                str = "0" + str;
            }
			if (rtl==false) {
				for (let i = 0; i < str.length; i++) {
					this.ctx.drawImage(this.number, (str.charCodeAt(i) - 0x30) * 8, white ? 0 : 16, 8, 16, x + 8 * i, y, 8, 16);
				}
			}
			else if(rtl==true) //right-to-left, for the right-aligned numbers in the settings panels
				for (let i = str.length-1; i >= 0; i--) {
					this.ctx.drawImage(this.number, (str.charCodeAt(i) - 0x30) * 8, white ? 0 : 16, 8, 16, x - 8 * (str.length-i), y, 8, 16);
				}
        }
        
        drawHeadFoot(x, y, argument) {
            //argument=0 for head, 1 for foot, 2 for 'end'
            this.ctx.drawImage(this.cursor, 44+12*argument,16,12,16-16*(argument==2),x,y,12,16);
        }

        onUpdate() {
            if (this.requested) return;
            this.requested = true;
            window.requestAnimationFrame(this.draw.bind(this));
        }

        draw() {
            this.requested = false;

            const { width, height } = this.canvas;
            this.ctx.clearRect(0, 0, width, height);

            const maxY = 8 * 144 - this.canvas.height + 176;
            if (this.scrollY < 0) this.scrollY = 0;
            if (this.scrollY > maxY) this.scrollY = maxY;

            const meas = this.organya ? this.organya.song.meas : [4, 4];
            const startMeas = this.organya ? (this.organya.playPos / (meas[0] * meas[1]) | 0) : 0;
			
			//this.ctx.drawImage(this.piyo, 0, 0, 128, 128, width/2-128/2, height/2-128/2, 128, 128); //splash image

            let y = -this.scrollY;
            while (y < height) { //drawing the main background, ticks and all
                let beat = 0;
                let subBeat = 0;
                let x = 36+8;
                let measId = startMeas;
                while (x < width) {
                    let sprX = 60;
					let dx = 12;
                    if (subBeat === 0) {
						sprX = 48;
						dx = 12;
					}
                    if (subBeat === 0 && beat === 0) {
                        sprX = 36;
						dx = 12;
                    }
                    if (++subBeat === meas[1]) {
                        subBeat = 0;
                        if (++beat === meas[0]) beat = 0;
                    }
                    this.ctx.drawImage(this.pianoRoll, sprX, 0, dx, 144, x, y, 12, 144);
                    x += 12;
                }

                y += 144;
            }

            let octave = 7; //piano roll on left
            y = -this.scrollY;
            while (y < height) {
                this.ctx.drawImage(this.pianoRoll, 0, 0, 36, 144, 8, y, 36, 144);
                this.drawNumber(25+8, y + 126, octave, 0, true);
                if (octave-- === 0) break;
                y += 144;
            }
			
			x = 8;
			while (x < width) {
				this.ctx.drawImage(this.pianoRoll, 0, 240, 12, 16, x, height-84-16-76, 12, 16); // red strip along which chick runs
				x += 12;
			}
			
			y = height-84-76;
            this.ctx.drawImage(this.pianoRoll, 0, 144, 36, 84, 8, y, 36, 84); //pan table
			x = 36;
			let beat = 0;
            let subBeat = 0;
            let measId = startMeas;
			while(x < width) {
				let playPos = measId*this.organya.MeasxStep + subBeat;
				let sprX = 60;
				let dx = 12;
				if (subBeat === 0) {
					sprX = 48;
					dx = 12;
				}
				if (subBeat === 0 && beat === 0) {
					sprX = 36;
					dx = 12;
					if (this.organya!=null && measId==(this.organya.song.start / this.organya.MeasxStep | 0)){ // bitwise OR with 0 looks like it does nothing, but actually turns things into int (so basically floor function)
						this.drawHeadFoot(x+8, height-84-16-76, 0); //song start/end markers
					}
					if (this.organya!=null && measId==(this.organya.song.end / this.organya.MeasxStep | 0)){
						this.drawHeadFoot(x+8, height-84-16-76, 1);
					}
					if (this.organya!=null && measId==(this.organya.song.songLength / this.organya.MeasxStep | 0)){
						this.drawHeadFoot(x+8, height-84-16-76, 2);
					}
					this.drawNumber(x+12+8, height-84-16-76, measId++, 3); //+12 because piyopiyo draws the measure number a bit to the right. well, not really, but this makes the start/end symbols more visible
				}
				if (++subBeat === meas[1]) {
					subBeat = 0;
					if (++beat === meas[0]) beat = 0;
				}
				this.ctx.drawImage(this.pianoRoll, sprX, 144, dx, 84, x+8, y, 12, 84); //pan table
				x += 12;
			}
			
            if (this.organya) {
                const viewPos = startMeas * meas[0] * meas[1];
                const scrollX = viewPos * 12 - 36;
				let chickX = this.organya.playPos*12 - scrollX;

                trackLoop: for (let track = 3; track >= 0; track--) {
					var noteheads = []; //icons for each track
					for (let icon_i=0; icon_i<3; icon_i++) {
						noteheads.push(this.organya.song.instruments[icon_i].icon);
					}
					var dramheads = [0,0,0,0,1,1,1,1,2,2,2,2,3,3,4,4,4,4,4,4,4,4,5,5];
                    const trackRef = this.organya.song.tracks[track];
                    let noteIdx = Math.max(0, trackRef.findIndex((n) => n.pos >= viewPos) - 1); //what is going on here?
                    if (noteIdx === -1) continue;
					
					if (track != 3) {
						var notehead = noteheads[track];
						var sprHeadX = (notehead % 10)*12 + 120*(track!=this.organya.selectedTrack); //the extra term is to highlight selected track notes
						var sprHeadY = ~~(notehead / 10)*12; //~~ is also like a floor function
					}					
                    var x = 36;
                    while (x < width) {
                        const record = trackRef[noteIdx++];
                        if (!record) continue trackLoop;
						var panY = height - 12*(record.pan + 4*(record.pan==0)) - 76; //pan values of 0 and 4 both count as centred
						for(let i_note=0; i_note<record.keys.length; i_note++) {
							var noteX = record.pos * 12 - scrollX;
							var noteY = (95 - (record.keys[i_note] + 12*this.organya.song.instruments[track].baseOctave)) * 12 - this.scrollY - 6*(chickX == noteX);
							x = noteX;
							x+=12;

							if(noteY<height-84-16-76 && noteY>8) { //keeping the red bar and pan area and the top purple border clear
								if (track == 3) {
									sprHeadX = 12*dramheads[record.keys[i_note]] + 120*(track!=this.organya.selectedTrack);
									sprHeadY = 120;
								}
							let note_bar_overlap = Math.max((noteY+12)-(height-84-16-76), 0);
							this.ctx.drawImage(this.noteImg, sprHeadX, sprHeadY, 12, 12-note_bar_overlap, noteX+8, noteY, 12, 12-note_bar_overlap); //notes
							}
							if (track==this.organya.selectedTrack) this.ctx.drawImage(this.noteImg, sprHeadX, sprHeadY, 12, 12, noteX+8, panY, 12, 12); //pan values
						}
                    }
                }
            }
			
			if(this.organya){
                const viewPos = startMeas * meas[0] * meas[1];
                const scrollX = viewPos * 12 - 36;
				let chickX = this.organya.playPos*12 - scrollX;
				this.ctx.drawImage(this.cursor, 68, 16, 12, 16, chickX+8, height-84-16-76, 12, 16); //running chick
			}
			
			// purple border
			x = 0;
			while (x < width) {
				this.ctx.drawImage(this.pianoRoll, 24, 232, 8, 8, x, 8, 8, 8);
				this.ctx.drawImage(this.pianoRoll, 120, 0, 8, 8, x, 0, 8, 8);
				this.ctx.drawImage(this.pianoRoll, 24, 248, 8, 8, x, height-76, 8, 8);
				x += 8;
			}
			this.ctx.drawImage(this.pianoRoll, 40, 240, 88, 16, 0, 0, 88, 16);
			y = 16;
			while (y < height-76) {
				this.ctx.drawImage(this.pianoRoll, 16, 240, 8, 8, 0, y, 8, 8);
				this.ctx.drawImage(this.pianoRoll, 32, 240, 8, 8, width-8, y, 8, 8);
				y += 8;
			}
			
			//settings etc
			this.ctx.drawImage(this.pianoRoll, 120, 0, 1, 1, 0, height-72+4, width, 72-4); //blacking out the settings area first
			this.ctx.drawImage(this.setting, 0, 0, 448, 72, 0, height-72, 448, 72); //settings panel
			this.ctx.drawImage(this.buttons, 0, 0, 144, 72, width-144, height-72, 144, 72); //green buttons
			if (this.organya) {
				this.ctx.drawImage(this.setting, 2, 72, 60, 2, this.organya.selectedTrack*64+2, height-58, 60, 2); //to make the selectedTrack tab look selected
				this.drawNumber(102, height-55, this.organya.song.instruments[this.organya.selectedTrack].volume, 0, false, true); //volume
				if (this.organya.selectedTrack!=3) {
					this.drawNumber(102, height-37, this.organya.song.instruments[this.organya.selectedTrack].envelopeLength, 0, false, true); //(envelope) length
					this.drawNumber(102, height-19, this.organya.song.instruments[this.organya.selectedTrack].baseOctave, 0, false, true); //octave
					var sprHeadX = (this.organya.song.instruments[this.organya.selectedTrack].icon % 10)*12;
					var sprHeadY = ~~(this.organya.song.instruments[this.organya.selectedTrack].icon / 10)*12;
					this.ctx.drawImage(this.noteImg, sprHeadX, sprHeadY, 12, 12, 172, height-55, 12, 12); //notehead image
				}
				this.drawNumber(438, height-55, this.organya.playPos, 0, false, true); //play position
				this.drawNumber(438, height-37, this.organya.song.songLength, 0, false, true); //music size
				this.drawNumber(438, height-19, this.organya.song.wait, 0, false, true); //music wait
			}
        }
    }

    window.OrganyaUI = OrganyaUI;
})();