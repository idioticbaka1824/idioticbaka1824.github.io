/* eslint-disable no-undef */

//node: {id:particle number, nodeType:external/internal, particleType=electron/positron/photon/virtual}
//link: {id:arbitrary identifier, source:particle id, target:particle id, linkType:fermion/boson, linkNum:0/1/2}
//linkNum is 0 if only one link between those points. If two links exist, one gets 1 and other gets 2
//careful not to double-count links, so only read, say, lower triangle of the adjMatrix (c<r condition)

var width = 640;
var height = 480;

var nodeExternalSize=10;
var nodeInternalSize=5;

function stringify(coming, going, results){
	var toReturn=[];
	for(var i_fd=0; i_fd<results.length; i_fd++){
		toReturn.push({'nodes':[], 'links':[]});
		for(var i=0; i<coming.length+going.length; i++){
			toReturn[i_fd].nodes.push({id:'svg_fd-'+i_fd+'_node-'+i, nodeType:'external', particleType:coming.concat(going)[i]});
		}
		for(var i=coming.length+going.length; i<n_t; i++){
			toReturn[i_fd].nodes.push({id:'svg_fd-'+i_fd+'_node-'+i, nodeType:'internal', particleType:'virtual'});
		}
		var adjMatrix=results[i_fd].adjMatrix;
		var n_links=0;
		for(var r=0; r<adjMatrix[0].length; r++){
			for(var c=0; c<r; c++){
				var linkMultiplicity=adjMatrix[r][c][0]+adjMatrix[r][c][1]+adjMatrix[r][c][2];
				var linkNum_aux=0;
				for(var i_lm=0; i_lm<3; i_lm++){
					if(adjMatrix[r][c][i_lm]){
						n_links++;
						linkNum_aux++;
						toReturn[i_fd].links.push({id:'svg_fd-'+i_fd+'_link-'+n_links, source:r, target:c, linkType:(i_lm==0?'boson':'fermion'), linkNum:(linkMultiplicity==1?0:linkNum_aux)});
					}
				}
			}
		}
	}
	return toReturn;
}

// function go_render(){
// console.log(stringify(coming, going, results));

// var stringifiedResults=stringify(coming, going, results);
// var nodes=stringifiedResults.nodes;
// var links=stringifiedResults.links;

var nodes = [
	{id:'svg_fd-0_node-0', nodeType:'external', particleType:'idk'},
	{id:'svg_fd-0_node-1', nodeType:'internal', particleType:'idk'}
];

var links=[
	{id:'svg_fd-0_link-0', source:0, target:1, linkType:'fermion', linkNum:1},
	{id:'svg_fd-0_link-1', source:0, target:1, linkType:'boson', linkNum:2}
];

var svg = d3
  .select('#fd-myDisplaySection')
  .append('svg')
  .attr('width', width)
  .attr('height', height);

var linkSelection = svg
  .selectAll('path')
  .data(links)
  .enter()
  .append('path')
  .attr('stroke', 'black')
  .attr('stroke-width', 1)
  .attr('fill', 'transparent')
  .attr('class', d => d.linkType)
  .attr('id', d=>d.id);
  
var linkSelectionBoson = svg
	.selectAll('path.boson')
	.attr('stroke-width', 0);
	
var arrowheadSelection = svg
  .selectAll('polygon')
  .data(links.filter((item)=>item.linkType=='fermion'))
  .enter()
  .append('polygon')
  .attr('stroke', 'black');

var nodeSelection = svg
  .selectAll('circle')
  .data(nodes)
  .enter()
  .append('circle')
  .attr('r', d => d.nodeType=='external'?nodeExternalSize:nodeInternalSize)
  .attr('fill', d => d.color)
  .attr('class', d => d.nodeType)
  .attr('id', d=>d.id)
  .call(
    d3
      .drag()
      .on('start', dragStart)
      .on('drag', drag)
      .on('end', dragEnd)
  );

var simulation = d3.forceSimulation(nodes);

simulation
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('nodes', d3.forceManyBody())
  .force(
    'links',
    d3
      .forceLink(links)
      // .id(d => parseInt(d.id.slice(-1... wait, no guarantee it's a 1-digit number)))
      .distance(d => 5 * (d.source.size + d.target.size))
  )
  .on('tick', ticked);

function ticked() {
  // console.log(simulation.alpha());

	nodeSelection.attr('cx', d => d.x).attr('cy', d => d.y);

	linkSelection.attr('d', linkArc);
	linkSelectionBoson.attr('d', linkArcBoson).attr('stroke-width', 1);
	arrowheadSelection.attr('points', arrowhead);
}

function dragStart(d) {
  //console.log('drag start');
  simulation.alphaTarget(0.5).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function drag(d) {
  //console.log('dragging');
  //simulation.alpha(0.5).restart()
  d.fx = d3.event.x;
  d.fy = d3.event.y;
}

function dragEnd(d) {
  //console.log('drag end');
  simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

function linkArc(d){
	x1=d.source.x;
	x2=d.target.x;
	y1=d.source.y;
	y2=d.target.y;
	//quadratic bezier control point. halfway through the joining line segment plus a perpendicular contribution (of amplitude h)
	var h=0.75;
	x3=((x1+x2)/2) + (d.linkNum - 3*(d.linkNum==2))*(y2-y1)*h;
	//the prefactor on the second term maps 0:0, 1:1, 2:-1. If linkNum=0, straight line, so control point lies along line segment.
	//if linknum 1 or 2, we want to add/subtract perpendicular contribution, so multiply 1/-1 if linkNum is 1/2.
	y3=((y1+y2)/2) + (d.linkNum - 3*(d.linkNum==2))*(x1-x2)*h;
	basicLine = 'M '+x1+' '+y1+' Q '+x3+' '+y3+', '+x2+' '+y2;
	return basicLine;
}

function arrowhead(d){
	myPath=document.getElementById(d.id);
	x1=d.source.x;
	x2=d.target.x;
	y1=d.source.y;
	y2=d.target.y;
	dist=Math.sqrt((x2-x1)**2+(y2-y1)**2);
	h=0.75;
	x3=myPath.getPointAtLength(myPath.getTotalLength()/2).x;
	y3=myPath.getPointAtLength(myPath.getTotalLength()/2).y;
	x5=x3+nodeInternalSize*(x2-x1)/dist;
	y5=y3+nodeInternalSize*(y2-y1)/dist;
	x4=x3-nodeInternalSize*(x2-x1)/dist + h*nodeInternalSize*(y2-y1)/dist;
	y4=y3-nodeInternalSize*(y2-y1)/dist + h*nodeInternalSize*(x1-x2)/dist;
	x6=x3-nodeInternalSize*(x2-x1)/dist - h*nodeInternalSize*(y2-y1)/dist;
	y6=y3-nodeInternalSize*(y2-y1)/dist - h*nodeInternalSize*(x1-x2)/dist;
	return ''+x3+','+y3+' '+x4+','+y4+' '+x5+','+y5+' '+x6+','+y6;
}

function linkArcBoson(d){
	myPath=document.getElementById(d.id);
	return computeWave(myPath, nodeInternalSize, 0, 1);
}

function computeWave(path, maxAmp, phase, res){
  // Get the points of the geometry with the given resolution
  const length = path.getTotalLength();
  freq=length/15;
  const points = [];
  if (res < 0.1) res = 0.1; // prevent infinite loop
  for (let i = 0; i <= length + res; i += res) {
    const { x, y } = path.getPointAtLength(i);
    points.push([x, y]);
  }
  // For each of those points, generate a new point...
  const sinePoints = [];
  for (let i = 0; i < points.length - 1; i++) {
    // Numerical computation of the angle between this and the next point
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const ang = Math.atan2(y1 - y0, x1 - x0);
    // Turn that 90 degrees for the normal angle (pointing "left" as far
    // as the geometry is considered):
    const normalAngle = ang - Math.PI / 2;
    // Compute the sine-wave phase at this point.
    const pointPhase = ((i / (points.length - 1)) * freq - phase) * Math.PI * 2;
    // Compute the sine-wave amplitude at this point.
    const amp = Math.sin(pointPhase) * maxAmp;
    // Apply that to the current point.
    const x = x0 + Math.cos(normalAngle) * amp;
    const y = y0 + Math.sin(normalAngle) * amp;
    sinePoints.push([x, y]);
  }
  // Terminate the sine points where the shape ends.
  sinePoints.push(points[points.length - 1]);
  // Compute SVG polyline string.
  return sinePoints
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`)
    .join(" ");
}

// }