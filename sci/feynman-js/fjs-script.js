console.log('hiii')

//In adjacency matrix: first few rows for reactant nodes, next few rows for product nodes, remaining rows for internal vertices

//elements of the 'adjacency matrix' are 3-element boolean arrays, whether or not there's a undirected, directed, antidirected edge resp.
var myDictComing = {'0':0, '1':2, '-1':1};
var myDictGoing = {'0':0, '1':1, '-1':2}

function flipJoin(kindOfJoin){ //flip direction of an edge
	switch(kindOfJoin){
		case 0:
			return 0;
		case 1:
			return 2;
		case 2:
			return 1;
	}
}

function isValid(fd){
	//if(adjMatrix.length!=n_t || adjMatrix[0].length!=n_t){return 'wrong size'} //adjacency matrix must be n_t by n_t
}

function isItJoined(adjMatrix, X, index, kindOfJoin){ //finding all edges of all kinds into/outof any node. X=r/c for row/column
	var isItJoinedValue=false;
	if(X=='r'){
		for(var i=0; i<n_t; i++){
			isItJoinedValue=isItJoinedValue||adjMatrix[index][i][kindOfJoin];
		}
	}
	else if(X=='c'){
		for(var i=0; i<n_t; i++){
			isItJoinedValue=isItJoinedValue||adjMatrix[i][index][kindOfJoin];
		}
	}
	return isItJoinedValue;
}

class FeynmanDiagram {
	constructor(adjMatrix, currentParticle, n_equivInt){
		this.adjMatrix=adjMatrix;
		this.currentParticle=currentParticle;
		this.n_equivInt=n_equivInt; //number of equivalent internals, i.e. how many internal vertices are bare and thus equivalent
	}
	
	children(){ //take a diagram, find out all possible/feasible next steps, put those diagrams in a list and return
		var toReturn=[];
		if(this.currentParticle<n_c+n_g){ //if we're still at an external particle,
			for(var i=n_c+n_g; i<=n_t-this.n_equivInt-(this.n_equivInt==0); i++){ //iterate over all nonequivalent internal vertices (<= used here because we do want exactly one of the bare vertices)(and if there's no bare vertices we want all internal vertices)
				if (this.currentParticle<n_c){ //we are currently trying out joining incoming particles to internal vertices
					//join incoming particle #currentParticle to internal vertex #i appropriately, unless it clashes somehow
					var kindOfJoin=myDictComing[coming[this.currentParticle]]; //0,1,2 = undirected,directed,antidirected
				}
				else if (this.currentParticle>=n_c && this.currentParticle<n_c+n_g){ //we are currently trying out joining outgoing particles to internal vertices
					//join outgoing particle #currentParticle to internal vertex #i appropriately, unless it clashes somehow
					var kindOfJoin=myDictGoing[going[(this.currentParticle-n_c)]]; //the -n_c is cuz currentParticle iterates over all external particles, but coming and going particles are stored in different arrays		
				}
				var isItJoinedValue=isItJoined(this.adjMatrix, 'c', i, kindOfJoin); //the idea is that only one kind of each join is allowed for each internal vertex
				if(isItJoinedValue==false){ //if the proposed kind of join doesn't already exist, join it and make a child
					var newChild = new FeynmanDiagram(structuredClone(this.adjMatrix), this.currentParticle+1, this.n_equivInt-(i==n_t-this.n_equivInt));
					//that's since you're done trying to join this particle, and also there's the case of when you're joining to the canonical bare vertex and so need to increment n_equivInt	
					newChild.adjMatrix[this.currentParticle][i][kindOfJoin]=true;
					newChild.adjMatrix[i][this.currentParticle][flipJoin(kindOfJoin)]=true;
					console.log('newchild: ', newChild)	
					toReturn.push(newChild);
				}
			}
		}
		
		else{ //external particles exhausted, internal-internal joinings now
			// for each unique internal vertex (keep using currentParticle to iterate over these): what valid connections can be made from it? and to whom can it be made to stay valid? list all these possibilities and make a child for each one
			var kindsOfJoins=[isItJoined(this.adjMatrix, 'r', this.currentParticle, 0), isItJoined(this.adjMatrix, 'r', this.currentParticle, 1), isItJoined(this.adjMatrix, 'r', this.currentParticle, 2)]
			//that is a boolean array of whether or not the current particle (an internal vertex) has undirected/directed/antidirected edge coming from it
			//take the first false out of that, try making a join of that kind. if that is the last kind of join needed, and the vertex is subsequently fulfilled, increment currentParticle
			var unfKindOfJoin=null; //the first false value, a (canonically chosen) unfulfilled kind of join for the vertex
			var n_falses=0;
			for (var i=2; i>=0; i--){
				if (kindsOfJoins[i]==false){
					unfKindOfJoin=i;
					n_falses++;
				}
			}
			if(this.currentParticle==n_t-1){ //if the current vertex is fulfilled, we must have a valid feynman diagram on our hands
				if(unfKindOfJoin==null){toReturn='valid';}
				else{toReturn='invalid';}
			}
			else{
				//now that we know what sort of join/edge we want to make from the current vertex, let's look for another internal vertex that will be a valid recipient of this proposed join/edge
				for(var i=this.currentParticle+1; i<=n_t-this.n_equivInt-(this.n_equivInt==0); i++){
					if(isItJoined(this.adjMatrix, 'r', i, flipJoin(unfKindOfJoin))==false){
						var newChild = new FeynmanDiagram(structuredClone(this.adjMatrix), this.currentParticle+(n_falses==1), this.n_equivInt-(i==n_t-this.n_equivInt));
						newChild.adjMatrix[this.currentParticle][i][unfKindOfJoin]=true;
						newChild.adjMatrix[i][this.currentParticle][flipJoin(unfKindOfJoin)]=true;
						console.log('newchild: ', newChild)
						toReturn.push(newChild);
					}
				}
			}
		}
		console.log('fd.children() toReturn: ',toReturn);
		return toReturn;
	}
}

class FeynmanSearchTree {
	constructor(){
		var emptyMatrix=[];
		for(var i=0; i<n_t; i++){
			emptyMatrix.push([]);
			for(var j=0; j<n_t; j++){
				emptyMatrix[i].push([false, false, false])
			}
		}
		this.root = new FeynmanDiagram(emptyMatrix, 0, n_i);
		this.toVisit = [this.root];
	}
	
	search(){
		var toReturn=[];
		while(this.toVisit[0]!=undefined){ //why can't I just use !=[] to check for empty array?
			var currentNode=this.toVisit.shift();
			console.log('currentNode: ', currentNode);
			var newChildren=currentNode.children();
			if(newChildren!='valid'&&newChildren!='invalid'){
				for(var i=0; i<newChildren.length; i++){
					this.toVisit.push(newChildren[i]);
				}
				console.log('newchildren: ', newChildren);
				console.log('tovisit: ', this.toVisit);
			} //append for BFS, prepend for DFS
			else if(newChildren=='valid'){
				toReturn.push(currentNode)
			}
		}
		return toReturn;
	}
}

function stringify(results){
	var toReturn=[];
	for(var i_fd=0; i_fd<results.length; i_fd++){
		toReturn.push({'nodes':[], 'links':[]});
		for(var i=0; i<n_c+n_g; i++){
			toReturn[i_fd].nodes.push({id:'svg_fd-'+i_fd+'_node-'+i, nodeType:i<n_c?'coming':'going', particleType:coming.concat(going)[i]});
		}
		for(var i=coming.length+going.length; i<n_t; i++){
			toReturn[i_fd].nodes.push({id:'svg_fd-'+i_fd+'_node-'+i, nodeType:'internal', particleType:'virtual'});
		}
		var adjMatrix=results[i_fd].adjMatrix;
		var n_links=-1;
		for(var r=0; r<adjMatrix[0].length; r++){
			for(var c=0; c<r; c++){
				var linkMultiplicity=adjMatrix[r][c][0]+adjMatrix[r][c][1]+adjMatrix[r][c][2];
				var linkNum_aux=0;
				for(var i_lm=0; i_lm<3; i_lm++){
					if(adjMatrix[r][c][i_lm]){
						n_links++;
						linkNum_aux++;
						toReturn[i_fd].links.push({id:'svg_fd-'+i_fd+'_link-'+n_links, source:i_lm==2?c:r, target:i_lm==2?r:c, linkType:(i_lm==0?'boson':'fermion'), linkNum:(linkMultiplicity==1?0:linkNum_aux)});
					}
				}
			}
		}
	}
	return toReturn;
}

function go_script(){
	
	var go_script_return='';
	
	document.getElementById('fd-myDisplaySection').innerHTML='';
	
	coming=document.getElementById('incomingList').value.split(',');
	going=document.getElementById('outgoingList').value.split(',');	
	n_c=coming.length //number of (in)coming particles
	n_g=going.length //number of (out)going particles
	n_i=parseInt(document.getElementById('n_internal').value); //number of internal vertices, to be set by user
	n_t=n_c+n_g+n_i //number of vertices, total
	
	var comingCharge=0;
	var goingCharge=0;
	
	mySearchTree = new FeynmanSearchTree();
	results = mySearchTree.search();
	stringResults=stringify(results);
	console.log('results: ', results);
	console.log('sresults: ', stringResults);
	go_script_return=results.length+' diagram(s) found.'
	return go_script_return;
}