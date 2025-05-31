(() => {
	CanvasRenderingContext2D.prototype.drawImage2 = function(my_image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight){
		this.drawImage(my_image, Math.round(sx), Math.round(sy), Math.round(sWidth), Math.round(sHeight), Math.round(dx), Math.round(dy), Math.round(dWidth), Math.round(dHeight))
	} //there were some glitches in the image rendering around the edges that was apparently caused by subpixel rendering, this fixes that
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
            this.noteImg.src = "GUI/Note.png";
            this.noteImg.addEventListener("load", this.onImageLoad.bind(this));
            this.pianoRoll = new Image();
            this.pianoRoll.src = "GUI/Music.png";
            this.pianoRoll.addEventListener("load", this.onImageLoad.bind(this));
            this.number = new Image();
            this.number.src = "GUI/Number.png";
            this.number.addEventListener("load", this.onImageLoad.bind(this));
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
            if (this.noteImg.complete && this.pianoRoll.complete && this.number.complete) {
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
                this.ctx.drawImage2(this.number, (str.charCodeAt(i) - 0x30) * 8, white ? 12 : 0, 8, 12, x + 8 * i, y, 8, 12);
            }
        }
        
        drawHeadFoot(x, y, argument) {
            //argument=0 for head, 1 for foot
            this.ctx.drawImage2(this.noteImg, 16*argument,32,16,11,x,y,16,11);
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
                let x = 64;
                let measId = startMeas;
                while (x < width) {
                    
                    let sprX = 96;
                    if (subBeat === 0) sprX = 80;
                    if (subBeat === 0 && beat === 0) {
                        
                        sprX = 64;
                        this.drawNumber(x, height-12, measId, 3);
                        this.drawNumber(x, 0, measId++, 3);
                        
                    }

                    if (++subBeat === meas[1]) {
                        subBeat = 0;
                        if (++beat === meas[0]) beat = 0;
                    }
                    

                    this.ctx.drawImage2(this.pianoRoll, sprX, 0, 16, 144, x, y, 16, 144);
                    x += 16;
                }

                y += 144;
            }

            if (this.organya) {
                const viewPos = startMeas * meas[0] * meas[1];
                const scrollX = viewPos * 16 - 64;

                // draw notes (heads and tails together)
				let trackLoopBool = true; //this while loop business lets us throw in an additional track drawing round at the end, so that the selected track can be drawn on top.
				let track = 15;
				trackLoop: while(trackLoopBool) {
					if(track<0){
						track = this.organya.selectedTrack;
						trackLoopBool = false;
					}
                    const trackRef = this.organya.song.tracks[track];
                    let noteIdx = Math.max(0, trackRef.findIndex((n) => n.pos+n.len >= viewPos) - 1);
                    if (noteIdx === -1) continue;
					
					let sprHeadX = (track & 1) * 16;
					let sprHeadY = 48 + (track / 2 | 0) * 8 + 64*(track==this.organya.selectedTrack); //the extra term is to highlight selected track notes
					let sprTailX = 32;
					let sprTailY = 32 + track * 4 - 32*(track==this.organya.selectedTrack);

                    let x = 64;
                    noteLoop: while (x < width) {
                        const note = trackRef[noteIdx++];
                        if (!note) {track--; continue trackLoop;}
					
						if((track<8)!=(this.organya.selectedTrack<8)){ //if melody tracks are selected, drum tracks are drawn greyed out. and vice versa
							let nk = note.key%12;
							let is_black_key = (nk==1)||(nk==3)||(nk==6)||(nk==8)||(nk==10);
							sprHeadX = 32;
							sprHeadY = 88 + 16*(is_black_key);
							sprTailX = 32;
							sprTailY = 96 + 4*(is_black_key);
						}

                        const noteX = note.pos * 16 - scrollX;
                        const noteY = (95 - note.key) * 12 - this.scrollY;
						
						if(noteY<3) continue noteLoop; //hide tails when they're at the top row, so the header numbers are clearly visible.

                        x = noteX;
                        for (let i = 0; i < note.len; i++) {
                            this.ctx.drawImage2(this.noteImg, sprTailX, sprTailY, 16, 4, noteX + i * 16, noteY + 4, 16, 4);
                            x += 16;
                        }
						this.ctx.drawImage2(this.noteImg, sprHeadX, sprHeadY, 16, 8, noteX, noteY + 3, 16, 8);
                    }
					track--;
                }
            }

            let octave = 7;
            y = -this.scrollY;
            while (y < height) {
                this.ctx.drawImage2(this.pianoRoll, 0, 0, 64, 144, 0, y, 64, 144);
                this.drawNumber(54, y + 132, octave, 0, true);
                if (octave-- === 0) break;
                y += 144;
				
                let beat = 0;
                let subBeat = 0;
                let x = 64;
                let measId = startMeas;
				while (x < width) {
                    
                    let sprX = 96;
                    if (subBeat === 0) sprX = 80;
                    if (subBeat === 0 && beat === 0) {
                        
                        if (this.organya!=null && measId==(this.organya.song.start / this.organya.MeasxStep | 0)){
                            this.drawHeadFoot(x, height-24, 0);
                        }
						
                        this.drawNumber(x, height-12, measId, 3);
                        this.drawNumber(x, document.getElementById('noncanvas').offsetHeight, measId++, 3);
                        
                        if (this.organya!=null && measId==(this.organya.song.end / this.organya.MeasxStep | 0)){
                            this.drawHeadFoot(x+16*this.organya.MeasxStep, height-24, 1);
                        }
                    }

                    if (++subBeat === meas[1]) {
                        subBeat = 0;
                        if (++beat === meas[0]) beat = 0;
                    }
                    x += 16;
                }
				
            }
        }
    }

    window.OrganyaUI = OrganyaUI;
})();