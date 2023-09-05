/* eslint-disable no-undef */
function go_render(stringFD){
	console.log(stringFD);

//node: {id:particle number, nodeType:coming/going/internal}
//link: {id:arbitrary identifier, source:particle id, target:particle id, linkType:fermion/boson, linkNum:0/1/2}
//linkNum is 0 if only one link between those points. If two links exist, one gets 1 and other gets 2
//careful not to double-count links, so only read, say, lower triangle of the adjMatrix

var nodeExternalSize=6;
var nodeInternalSize=4;

var width=200;
var height=200;

// var nodes = [
  // { color: 'red', size: 5 },
  // { color: 'orange', size: 10 },
  // { color: 'yellow', size: 15 },
  // { color: 'green', size: 20 },
  // { color: 'blue', size: 25 },
  // { color: 'purple', size: 30 }
// ];

// var links = [
  // { source: 'red', target: 'orange' },
  // { source: 'red', target: 'orange' },
  // { source: 'orange', target: 'yellow' },
  // { source: 'yellow', target: 'green' },
  // { source: 'green', target: 'blue' },
  // { source: 'blue', target: 'purple' },
  // { source: 'purple', target: 'red' },
  // { source: 'green', target: 'red' }
// ];

// var nodes = [
	// {id:'svg_fd-0_node-0', nodeType:'external'},
	// {id:'svg_fd-0_node-1', nodeType:'internal'}
// ];

// var links=[
	// {id:'svg_fd-0_link-0', source:0, target:1, linkType:'fermion', linkNum:1},
	// {id:'svg_fd-0_link-1', source:0, target:1, linkType:'boson', linkNum:2}
// ];

nodes=stringFD.nodes;
for(var _=0;_<nodes.length;_++){nodes[_].size=5;nodes[_].index2=_;} //why do i need this? idk
links=stringFD.links;

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
  .attr('stroke', 'black')
  .attr('name', d=>d.id);

var nodeSelection = svg
  .selectAll('circle')
  .data(nodes)
  .enter()
  .append('circle')
  .attr('r', d => d.nodeType=='internal'?nodeInternalSize:nodeExternalSize)
  .attr('fill', d => d.color)
  .attr('class', d => d.nodeType)
  .attr('id', d=>d.id)
  .attr('name',d=>d.particleType)
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
	.force('y', d3.forceY(d=>height*(d.index2+1)/(n_c+1)).strength(d=>d.nodeType=='coming'))
	.force('x', d3.forceX(width/10).strength(d=>d.nodeType=='coming'))
	.force('y2', d3.forceY(d=>height*(d.index2+1-n_c)/(n_g+1)).strength(d=>d.nodeType=='going'))
	.force('x2', d3.forceX(9*width/10).strength(d=>d.nodeType=='going'))
  .on('tick', ticked);


function ticked() {
  // console.log(simulation.alpha());

	nodeSelection.attr('cx', d => d.x).attr('cy', d => d.y);

	linkSelection.attr('d', linkArc);
	try{linkSelectionBoson.attr('d', linkArcBoson).attr('stroke-width', 1); //for some reason i need to do this try/catch thing to be able to press 'go' more than once without refreshing
	arrowheadSelection.attr('points', arrowhead);}
	catch(err){console.log(err)};
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
	if(d.source.index>d.target.index){ //sometimes it is technically directed oppositely which makes it overlap with line b/t the same points. couldn't avoid that when stringifying so this is a stopgap solution
		var c=x1; x1=x2; x2=c;
		c=y1; y1=y2; y2=c;
	}
	//quadratic bezier control point. halfway through the joining line segment plus a perpendicular contribution (of amplitude h)
	var h=0.75;
	x3=((x1+x2)/2) + (d.linkNum - 3*(d.linkNum==2))*(y2-y1)*h;
	//the prefactor on the second term maps 0:0, 1:1, 2:-1. If linkNum=0, straight line, so control point lies along line segment.
	//if linknum 1 or 2, we want to add/subtract perpendicular contribution, so multiply 1/-1 if linkNum is 1/2.
	y3=((y1+y2)/2) + (d.linkNum - 3*(d.linkNum==2))*(x1-x2)*h;
	basicLine = 'M '+x1+' '+y1+'Q '+x3+' '+y3+', '+x2+' '+y2;
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


}