function fancyLog(category, color, message) {
	console.log("%c[" + category + "]", "color:" + color, message);
}
function setStatusMessage(message) {
	fancyLog("STATUS", 'blue', message);
	document.getElementById("status-message").innerHTML = message;
}

document.addEventListener("DOMContentLoaded", async function(){
	setStatusMessage("Loading configuration");
	const configResponse = await fetch('config.json');
	config = await configResponse.json();

	setStatusMessage("Loading calendar");

	let calendarUrl = config.calendarUrl;
	if ( config.calendarUseCorsProxy ) {
		fancyLog("CALUPD", 'green', "Using CORS proxy");
		calendarUrl = config.calendarUseCorsProxy + "?" + encodeURIComponent(calendarUrl);
	}
	fancyLog("CALUPD", 'green', calendarUrl);
	const calendarResponse = await fetch(calendarUrl);
	let iCalData = await calendarResponse.text();
	console.log(iCalData.split('\n')[0] + "...");

	setStatusMessage("Reticulating splines");

	fancyLog("CALUPD", 'green', "Parsing calendar");
	jCalData = ICAL.parse(iCalData);

	fancyLog("CALUPD", 'green', "Getting only events");
	//We use only the last section(?) - hard coding for google calendar (HACK)
	jCalRawEvents = jCalData[jCalData.length-1].filter(function(thing) {
		return thing[0].toLowerCase() == "vevent";
	});
	//.map(function(thing) {
	//	return new ICAL.Component(thing);
	//});

	fancyLog("CALUPD", 'green', "Filtering " + jCalRawEvents.length + " events");
	jCalEventOccurrenceTuples = [];
	for ( let rawEvent of jCalRawEvents ) {
		let event = new ICAL.Event(new ICAL.Component(rawEvent));
		let component = new ICAL.Component(rawEvent);
		let expand = new ICAL.RecurExpansion({
			component: component,
			dtstart: component.getFirstPropertyValue('dtstart')
		});

		//let next = expand.last;
		//while ( next.toJSDate() < new Date(Date.now() + 7*(24*60*60*1000)) ) {
		let next;
		do {
			next = expand.next();
			if ( typeof next === 'undefined' ) break;
			//jCalEventOccurrenceTuples.push(next);
			jCalEventOccurrenceTuples.push([event, next]);
		} while ( next.toJSDate() < new Date(Date.now() + 7*(24*60*60*1000)) );
	}


	fancyLog("CALUPD", 'green', "Filtering " + jCalEventOccurrenceTuples.length + " tuples");
	jCalEventOccurrenceTuples = jCalEventOccurrenceTuples.filter(function(thing) {
		let durationSeconds = thing[0].duration.toSeconds();
		let occurrenceEnd = thing[1].toJSDate();
		occurrenceEnd.setSeconds(occurrenceEnd.getSeconds() + durationSeconds);
		//console.log("FILTER: ", thing[0].summary, " duration ", durationSeconds, " - ", thing[1], occurrenceEnd);
		//debug = thing;
		return occurrenceEnd > Date.now();
	});

	fancyLog("CALUPD", 'green', "Sorting " + jCalEventOccurrenceTuples.length + " events");
	jCalEventOccurrenceTuples = jCalEventOccurrenceTuples.sort(function(b,a){
		return new Date(b[1].toJSDate()) - new Date(a[1].toJSDate());
	});
	console.log(jCalEventOccurrenceTuples);

	setStatusMessage(false);
});
