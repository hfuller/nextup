ONE_HOUR = 60 * 60 * 1000; /* ms */

function fancyLog(category, color, message) {
	console.log("%c[" + category + "]", "color:" + color, message);
}
function setStatusMessage(message) {
	fancyLog("STATUS", 'blue', message);
	if ( message === false ) {
		message = "Current Schedule";
	}
	document.getElementById("status-message").innerHTML = message;
}

function getTupleEndDate(thing) {
	let durationSeconds = thing[0].duration.toSeconds();
	let occurrenceEnd = thing[1].toJSDate();
	occurrenceEnd.setSeconds(occurrenceEnd.getSeconds() + durationSeconds);
	return occurrenceEnd;
}

async function fetchCalendarData() {

	let calendarUrl = config.calendarUrl;
	if ( config.calendarUseCorsProxy ) {
		fancyLog("CALUPD", 'green', "Using CORS proxy");
		calendarUrl = config.calendarUseCorsProxy + "?" + encodeURIComponent(calendarUrl);
	}
	fancyLog("CALUPD", 'green', calendarUrl);
	const calendarResponse = await fetch(calendarUrl);
	let iCalData = await calendarResponse.text();
	console.log(iCalData.split('\n')[0] + "...");

	fancyLog("CALUPD", 'green', "Parsing calendar");
	let jCalData = ICAL.parse(iCalData);

	fancyLog("CALUPD", 'green', "Getting only events");
	//We use only the last section(?) - hard coding for google calendar (HACK)
	let jCalRawEvents = jCalData[jCalData.length-1].filter(function(thing) {
		return thing[0].toLowerCase() == "vevent";
	});
	//.map(function(thing) {
	//	return new ICAL.Component(thing);
	//});

	fancyLog("CALUPD", 'green', "Filtering " + jCalRawEvents.length + " events");
	let jCalEventOccurrenceTuples = [];
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
		//return getTupleEndDate(thing) > Date.now();
		//actually let's filter only stuff that ended at least an hour ago
		return getTupleEndDate(thing) > new Date(Date.now() - ONE_HOUR);
	});

	fancyLog("CALUPD", 'green', "Sorting " + jCalEventOccurrenceTuples.length + " events");
	jCalEventOccurrenceTuples = jCalEventOccurrenceTuples.sort(function(b,a){
		return new Date(b[1].toJSDate()) - new Date(a[1].toJSDate());
	});

	return jCalEventOccurrenceTuples;
}
function renderCalendar(tuples) {
	let ol = document.getElementsByTagName('ol')[0];

	fancyLog("RENDER", 'orange', 'clearing list');
	ol.replaceChildren([]);

	fancyLog("RENDER", 'orange', 'doing stuff');
	for ( let tuple of tuples ) {
		let eSummary = document.createElement('h3');
		eSummary.innerHTML = tuple[0].summary;

		//date magic
		let occurrenceBegin = tuple[1].toJSDate();
		let occurrenceEnd = getTupleEndDate(tuple);
		let now = Date.now();
		let today = new Date().getDate();

		let eTimes = document.createElement('h4');
		let beginString = occurrenceBegin.toLocaleTimeString('default', config.timeOptions);
		let endString = occurrenceEnd.toLocaleTimeString('default', config.timeOptions);
		if ( occurrenceBegin.getDate() != today ) { beginString = occurrenceBegin.toLocaleString('default', config.dateOptions) + " " + beginString; }
		if ( occurrenceEnd.getDate() != occurrenceBegin.getDate() ) { endString = occurrenceEnd.toLocaleString('default', config.dateOptions) + " " + endString; }
		let completeString = (beginString + " - " + endString).replaceAll(":00", ""); //lol
		eTimes.innerHTML = completeString;

		let li = document.createElement('li');
		li.appendChild(eSummary);
		li.appendChild(eTimes);

		if ( occurrenceEnd < now ) {
			//this event already ended
		}
		if ( occurrenceBegin < now && occurrenceEnd > now ) {
			//this event is in progress
		}
		if ( occurrenceBegin > now ) {
			//this event hasn't started
		}

		ol.appendChild(li);
	}

	console.log(tuples);
	fancyLog("RENDER", 'orange', "done rendering");
}

async function updateDisplay() {
	jCalEventOccurrenceTuples = await fetchCalendarData();
	renderCalendar(jCalEventOccurrenceTuples);
	document.getElementById("last-updated").innerHTML = "as of " + new Date(Date.now()).toLocaleString('default');
}

document.addEventListener("DOMContentLoaded", async function(){
	setStatusMessage("Loading configuration");
	const configResponse = await fetch('config.json');
	config = await configResponse.json();

	setStatusMessage("Loading calendar");
	await updateDisplay();
	setStatusMessage(false);
});
