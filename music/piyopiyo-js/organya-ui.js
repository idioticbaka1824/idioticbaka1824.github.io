(() => {
    class OrganyaUI {
        /**
         * @param {HTMLCanvasElement} canvas 
         */
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext("2d");
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
            if (this.noteImg.complete && this.pianoRoll.complete && this.number.complete && this.cursor.complete) {
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

        drawNumber(x, y, number, zeroPad = 0, white = false) {
            let str = number.toString();
            while (str.length < zeroPad) {
                str = "0" + str;
            }
            for (let i = 0; i < str.length; i++) {
                this.ctx.drawImage(this.number, (str.charCodeAt(i) - 0x30) * 8, white ? 0 : 16, 8, 16, x + 8 * i, y, 8, 16);
            }
        }
        
        drawHeadFoot(x, y, argument) {
            //argument=0 for head, 1 for foot
            this.ctx.drawImage(this.cursor, 44+12*argument,16,12,16,x,y,12,16);
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

            const maxY = 8 * 144 - this.canvas.height;
            if (this.scrollY < 0) this.scrollY = 0;
            if (this.scrollY > maxY) this.scrollY = maxY;

            const meas = this.organya ? this.organya.song.meas : [4, 4];
            const startMeas = this.organya ? (this.organya.playPos / (meas[0] * meas[1]) | 0) : 0;

            let y = -this.scrollY;
            while (y < height) {
                let beat = 0;
                let subBeat = 0;
                let x = 36;
                let measId = startMeas;
				
				while (x < width) {           
					this.ctx.drawImage(this.pianoRoll, 0, 240, 12, 16, x, 0, 12, 16); // red strip along which chick runs
					x += 12;
				}
				x = 36;
                while (x < width) {
					
                    let sprX = 60;
					let dx = 12;
                    if (subBeat === 0) {
						sprX = 48;
						dx = 12;
					}
                    if (subBeat === 0 && beat === 0) {
                        
                        if (this.organya!=null && measId==(this.organya.song.start / this.organya.MeasxStep | 0)){ // bitwise OR with 0 looks like it does nothing, but actually turns things into int (so basically floor function)
                            this.drawHeadFoot(x, 0, 0);
                        }
                        if (this.organya!=null && measId==(this.organya.song.end / this.organya.MeasxStep | 0)){
                            this.drawHeadFoot(x, 0, 1);
                        }
						
                        sprX = 36;
						dx = 12;
                        this.drawNumber(x+12, 0, measId++, 3); //+12 because piyopiyo draws the measure number a bit to the right
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

            if (this.organya) {
                const viewPos = startMeas * meas[0] * meas[1];
                const scrollX = viewPos * 12 - 36;
				
				let chickX = this.organya.playPos*12 - scrollX;
				this.ctx.drawImage(this.cursor, 68, 16, 12, 16, chickX, 0, 12, 16);

                trackLoop: for (let track = 3; track >= 0; track--) {
					var noteheads = []; //icons for each track
					for (let icon_i=0; icon_i<2; icon_i++) {
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
                        const note = trackRef[noteIdx++];
                        if (!note) continue trackLoop;

                        const noteX = note.pos * 12 - scrollX;
                        const noteY = (95 - note.key) * 12 - this.scrollY - 6*(chickX == noteX);

                        x = noteX;
                        for (let i = 0; i < note.len; i++) x += 12;

                        if(noteY>16) { //keeping the red bar at the top clear
							if (track == 3) {
								sprHeadX = 12*dramheads[note.key] + 120*(track!=this.organya.selectedTrack);
								sprHeadY = 120;
							}
							this.ctx.drawImage(this.noteImg, sprHeadX, sprHeadY, 12, 12, noteX, noteY, 12, 12);
						}
                    }
                }
            }

            let octave = 7;
            y = -this.scrollY;
            while (y < height) {
                this.ctx.drawImage(this.pianoRoll, 0, 0, 36, 144, 0, y, 36, 144);
                this.drawNumber(25, y + 126, octave, 0, true);
                if (octave-- === 0) break;
                y += 144;
            }
        }
    }

    window.OrganyaUI = OrganyaUI;
})();