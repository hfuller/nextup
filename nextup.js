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
		fancyLog("CFETCH", 'green', "Using CORS proxy");
		calendarUrl = config.calendarUseCorsProxy + "?" + encodeURIComponent(calendarUrl);
	}
	fancyLog("CFETCH", 'green', calendarUrl);
	const calendarResponse = await fetch(calendarUrl);
	let iCalData = await calendarResponse.text();
	fancyLog("CFETCH", 'green', (iCalData.split('\n')[0] + "..."));

	fancyLog("CFETCH", 'green', "Parsing calendar");
	let jCalData = ICAL.parse(iCalData);

	fancyLog("CFETCH", 'green', "Getting only events");
	//We use only the last section(?) - hard coding for google calendar (HACK)
	let jCalRawEvents = jCalData[jCalData.length-1].filter(function(thing) {
		return thing[0].toLowerCase() == "vevent";
	});
	//.map(function(thing) {
	//	return new ICAL.Component(thing);
	//});

	fancyLog("CFETCH", 'green', "Filtering " + jCalRawEvents.length + " events");
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


	fancyLog("CFETCH", 'green', "Filtering " + jCalEventOccurrenceTuples.length + " tuples");
	jCalEventOccurrenceTuples = jCalEventOccurrenceTuples.filter(function(thing) {
		//return getTupleEndDate(thing) > Date.now();
		//actually let's filter only stuff that ended at least an hour ago
		return getTupleEndDate(thing) > new Date(Date.now() - ONE_HOUR);
	});

	fancyLog("CFETCH", 'green', "Sorting " + jCalEventOccurrenceTuples.length + " events");
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
	let nextEventMarked = false;
	for ( let tuple of tuples ) {
		let eSummary = document.createElement('h3');
		eSummary.innerHTML = tuple[0].summary;

		let eRelativeTime = document.createElement('aside');

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

		let eLocation = document.createElement('h4');
		eLocation.innerHTML = tuple[0].location;

		let li = document.createElement('li');
		li.appendChild(eSummary);
		li.appendChild(eRelativeTime);
		li.appendChild(eTimes);
		li.appendChild(eLocation);
		li.setAttribute('start-time', occurrenceBegin);
		li.setAttribute('end-time', occurrenceEnd);

		if ( occurrenceEnd < now ) {
			//this event already ended
			li.classList.add("event-past");
		}
		if ( occurrenceBegin < now && occurrenceEnd > now ) {
			//this event is in progress
			li.classList.add("event-present");
		}
		if ( occurrenceBegin > now ) {
			//this event hasn't started
			li.classList.add("event-future");
			if ( !nextEventMarked ) {
				nextEventMarked = true;
				li.classList.add("event-next");
			}
		}

		ol.appendChild(li);
	}

	//console.log(tuples);
	fancyLog("RENDER", 'orange', "done rendering");
}

async function updateDisplay() {
	fancyLog("UPDATE", 'yellow', "Setting a watchdog timeout in case something goes horribly wrong");
	let tempTimeout = setTimeout(updateDisplay, 5*60*1000);
	
	jCalEventOccurrenceTuples = await fetchCalendarData();
	renderCalendar(jCalEventOccurrenceTuples);
	updateRelativeTimes();
	document.getElementById("last-updated").innerHTML = "as of " + new Date(Date.now()).toLocaleString('default');

	fancyLog("UPDATE", 'yellow', "Determining when we next have to update this sucker");
	let now = new Date(Date.now());
	let soon = new Date(Date.now() + ONE_HOUR);
	let msecsBeforeNextUpdate = ONE_HOUR;
	for ( let tuple of jCalEventOccurrenceTuples ) { 
		let when = tuple[1].toJSDate();
		if ( when < now ) {
			fancyLog("UPDATE", 'yellow', "We may be right in the middle of an event");
			when = getTupleEndDate(tuple);
		}
		if ( when > now && when < soon ) {
			fancyLog("UPDATE", 'yellow', tuple[0].summary + " is starting or ending soon");
			let msecsBeforeThisEvent = when - now;
			if ( msecsBeforeThisEvent < msecsBeforeNextUpdate ) {
				msecsBeforeNextUpdate = msecsBeforeThisEvent;
				fancyLog("UPDATE", 'yellow', "Now we will update in only " + msecsBeforeNextUpdate);
			}
		}
	}

	clearTimeout(tempTimeout);
	setTimeout(updateDisplay, msecsBeforeNextUpdate);
	fancyLog("UPDATE", 'yellow', "Watchdog cleared and update scheduled for " + msecsBeforeNextUpdate);
}
function updateRelativeTimes(ignoreConditionals) {
	//TODO refactor this
	for ( let li of document.getElementsByClassName('event-past') ) {
		//"ended x minutes ago"
		let mins = ( new Date(li.getAttribute('end-time')) - new Date(Date.now()) ) / 1000 / 60;
		if ( ignoreConditionals || mins < 60 ) {
			li.getElementsByTagName('aside')[0].innerHTML = "Ended" + Math.floor(mins) + " minutes ago";
		} else {
			li.getElementsByTagName('aside')[0].innerHTML = ""; //HACK HACK HACK, should never happen anyway
		}
	}
	for ( let li of document.getElementsByClassName('event-present') ) {
		//"ends in x minutes"
		let mins = ( new Date(li.getAttribute('end-time')) - new Date(Date.now()) ) / 1000 / 60;
		if ( ignoreConditionals || mins < 15 ) {
			li.getElementsByTagName('aside')[0].innerHTML = "Ends in " + Math.floor(mins) + " minutes";
		}
	}
	for ( let li of document.getElementsByClassName('event-next') ) {
		//"starts in x minutes"
		let mins = ( new Date(li.getAttribute('start-time')) - new Date(Date.now()) ) / 1000 / 60;
		if ( ignoreConditionals || mins < 60 ) {
			li.getElementsByTagName('aside')[0].innerHTML = "Starts in " + Math.floor(mins) + " minutes";
		}
	}
}
function updateClock() {
}

async function debugStyleEvents() {
	let x = document.getElementsByTagName('li');
	x[0].classList = "event-past";
	x[1].classList = "event-present";
	x[2].classList = "event-next";
}

document.addEventListener("DOMContentLoaded", async function(){
	setStatusMessage("Loading configuration");
	const configResponse = await fetch('config.json');
	config = await configResponse.json();

	setStatusMessage("Loading calendar");
	await updateDisplay();
	setStatusMessage(false);

	setInterval(updateRelativeTimes, 60000);
	setInterval(updateClock, 500);
});
