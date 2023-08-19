// Minimum and Maximum ratio between coins to dollars
const maxRatio = 1.99 / 500;
const minRatio = 199.99 / 82000;

// Literals
const texts = {
	ERROR_INVALID_URL: "That is not a valid URL!",
	ERROR_OFFLINE: "We can't find the internet. Perhaps you are offline?",
	ERROR_UNKNOWN: "We don't know what happened, but it didn't work. Perhaps trying again could work.",
	WARNING_USD_TO_COINS: "Dollar values can vary because Reddit Coins don't have one single exchange rate.",
	INPUT_PLACEHOLDER: "Enter reddit post/comment link..."
}

window.onload = onLoad;

var input;
var errorParagraph;

function thousandSeperators(number){
	number = Math.round(number * 100) / 100;
	return number.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, "'");
}

function findCommentRecursively(object, searchedId){
	if (object["data"]["id"] == searchedId){
		return object;
	} else {

		// Sometimes child elements are in "replies", sometimes in "children"
		let children;
		if (object["data"]["replies"] !== undefined){
			children = object["data"]["replies"];
		} else {
			children = object["data"]["children"];
		}

		let result = null;
		for (let reply of children){
			result ||= findCommentRecursively(reply, searchedId);
		}
		return result;

	}
}

function copyLink(){
	let parameters = window.location.search.substring(1).split("&");
	// If ?url=... is in URL, just copy URL that is already there
	if (parameters.some(p => p.startsWith("url"))){
		navigator.clipboard.writeText(window.location);
	}
	// If ?url=... is NOT present, copy current URL + "?url={input}"
	else if (input.value !== ""){
		navigator.clipboard.writeText(`${window.location.origin}?url=${input.value}`);
	}
}

function onLoad(){
	input = document.getElementById("urlinput");
	errorParagraph = document.getElementById("errorParagraph");

	input.placeholder = texts.INPUT_PLACEHOLDER;

	// Check URL for url parameter
	let parameters = window.location.search.substring(1).split("&");
	for (let parameter of parameters){
		if (parameter.startsWith("url")){
			// Simulate user input by changing input value and hitting "calculate" button
			input.value = parameter.split("=")[1];
			calculate();
		}
	}
}

function sanitizeURL(url){
	url = url.replaceAll(/[?&].+=.+/g, "");
	url = url.replace(/\/$/, "");
	return url;
}

function isURLValid(url){
	let urlParser = document.createElement("a");
	urlParser.href = url;

	// Correct domain
	if (!urlParser.hostname.startsWith("www.reddit")) return false;

	// Correct post path
	const RE_PATH = /(\/r\/.+\/comments\/[a-z0-9]+\/[0-9a-z_]+)(\/[a-z0-9_]+)?/
	if (!RE_PATH.test(urlParser.pathname)) return false;

	return true;
}

function isPost(url){
	let urlParser = document.createElement("a");
	urlParser.href = url;

	// 5 slashes => post; 6 slashes => comment
	console.log(urlParser.pathname);
	console.log((urlParser.pathname.match(/\//g) || []).length)
	return (urlParser.pathname.match(/\//g) || []).length < 6;
}

function httpRequest(url){
	console.log(url);

	// Make HTTP request
	let response = null;
	let error = null;

	let request = new XMLHttpRequest();
	request.onreadystatechange = function () {
		if (this.readyState === 4){
			if (this.status === 200){
				response = JSON.parse(this.responseText);
			} else if (this.reponse == null && this.status === 0){
				error = "offline";
			} else {
				error = "unknown";
			}
		}
	}

	request.open("GET", url, false);
	request.send(null);

	return {
		response: response,
		error: error
	};
}

function calculate(){

	// Reset everything from previous calculations
	let previousElements = document.getElementsByClassName("temp");
	while (previousElements.length){
		previousElements[0].remove()
	}
	errorParagraph.innerHTML = "";

	// Validity check
	let url = sanitizeURL(input.value);
	if (!isURLValid(url)){
		errorParagraph.innerHTML = texts.ERROR_INVALID_URL;
		return;
	}

	let { response, error } = httpRequest(`${url}/.json`);
	switch (error){
		case "offline":
			errorParagraph.innerHTML = texts.ERROR_OFFLINE;
			return;
		case "unknown":
			errorParagraph.innerHTML = texts.ERROR_UNKNOWN;
			return;
	}

	let awards;
	let userName;
	// Get awards from reponse
	// Check in URL if the post should be analysed or a comment with an id
	if (isPost(url)){
		console.log("Post!!");
		userName = response[0]["data"]["children"][0]["data"]["author"];
		awards = response[0]["data"]["children"][0]["data"]["all_awardings"];
	} else {
		console.log("Comment!!");
		let slashes = url.split("/");
		let commentId = slashes[slashes.length - 1];
		console.log(commentId);

		// Search through tree recursively for comment with correct id
		let result = findCommentRecursively(response[1], commentId)["data"];
		userName = result["author"];
		awards = result["all_awardings"];
	}
	
	// Calculate total amount of spent
	let coinsSpent = 0;
	let coinsRecieved = 0;
	let totalAwards = 0;
	let daysOfPremium = 0;
	let awardList = [];

	for (let awardObject of awards){

		// Calculate coins from amount and price
		let count = awardObject["count"];
		// In some cases, the count is negative (e.g. -30858) so I'm gonna assume that they use
		// signed shorts for this
		if (count < 0) count += 2**16;
		let amountSpent = count * awardObject["coin_price"];
		coinsSpent += amountSpent;
		let amountReceived = count * awardObject["coin_reward"];
		coinsRecieved += amountReceived;

		// Add other numbers
		totalAwards += count;
		if (awardObject["days_of_premium"] !== null){
			daysOfPremium += awardObject["days_of_premium"] * count;
		}

		let dollarsSpent = thousandSeperators(
			(
			Math.round(amountSpent * minRatio * 100) / 100 + 
			Math.round(amountSpent * maxRatio * 100) / 100
		) / 2);

		let dollarsReceived = thousandSeperators(
			(
			Math.round(amountReceived * minRatio * 100) / 100 + 
			Math.round(amountReceived * maxRatio * 100) / 100
		) / 2);

		awardList.push([
			awardObject["icon_url"],
			`${awardObject["name"]}<br/> x${thousandSeperators(count)}`,
			`${thousandSeperators(amountSpent)}¢<br/>~$${dollarsSpent}`,
			`${thousandSeperators(amountReceived)}¢<br/>~$${dollarsReceived}`,
		]);

	}

	// Convert to dollars
	let minDollarsSpent = thousandSeperators(coinsSpent * minRatio);
	let maxDollarsSpent = thousandSeperators(coinsSpent * maxRatio);
	let minDollarsReceived = thousandSeperators(coinsRecieved * minRatio);
	let maxDollarsReceived = thousandSeperators(coinsRecieved * maxRatio);

	// Header saying "results"
	let resultsTitle = document.createElement("h1");
	resultsTitle.innerHTML = "Results *";
	resultsTitle.classList.add("temp");
	resultsTitle.title = texts.WARNING_USD_TO_COINS
	document.body.appendChild(resultsTitle);

	// Display final results in table
	let resultsTable = document.createElement("table");
	resultsTable.classList.add("results");
	resultsTable.classList.add("temp");
	let resultSpent = document.createElement("tr");
	let resultReceived = document.createElement("tr");
	let resultPremium = document.createElement("tr");

	// Row: Dollars and Coins spent
	for (let text of [
		"Spent", `$${minDollarsSpent} - $${maxDollarsSpent}`, `${thousandSeperators(coinsSpent)}¢`
	]){
		let td = document.createElement("td");
		td.innerHTML = text;
		td.classList.add("th");
		resultSpent.appendChild(td);
	}

	// Row: Dollars and Coins received
	for (let text of [
		`Received<br/>by u/${userName}`, `$${minDollarsReceived} - $${maxDollarsReceived}`, `${thousandSeperators(coinsRecieved)}¢`
	]){
		let td = document.createElement("td");
		td.innerHTML = text;
		td.classList.add("th");
		resultPremium.appendChild(td);
	}

	// Row: Days of premium
	// Calculate date in n days
	let date = new Date();
	date = new Date(date.setDate(date.getDate() + daysOfPremium));
	let dateString = date.toDateString();

	for (let text of [
		`Premium for<br/>u/${userName}`, `${thousandSeperators(daysOfPremium)} Days`, dateString
	]){
		let td = document.createElement("td");
		td.innerHTML = text;
		td.classList.add("th");
		resultReceived.appendChild(td);
	}

	resultsTable.appendChild(resultSpent);
	resultsTable.appendChild(resultPremium);
	resultsTable.appendChild(resultReceived);

	document.body.appendChild(resultsTable);

	// Sort list of awards
	awardList.sort(function(a,b){
		return  parseInt(b[1].split("x").slice(-1)[0].replaceAll("'", "")) -
				parseInt(a[1].split("x").slice(-1)[0].replaceAll("'", ""));
	});

	// Header saying "breakdown"
	let breakdownTitle = document.createElement("h1");
	breakdownTitle.innerHTML = "Breakdown";
	breakdownTitle.classList.add("temp");
	document.body.appendChild(breakdownTitle);

	// Create table for breakdown of awards
	let breakdownTable = document.createElement("table");
	breakdownTable.classList.add("breakdown")
	breakdownTable.classList.add("temp");

	// Create table header
	let tableHeader = document.createElement("tr");

	for (let text of [
		"Image", "Name", "Spent", "Received"
	]){
		let td = document.createElement("td");
		td.innerHTML = text;
		td.classList.add("th");
		tableHeader.appendChild(td);
	}

	// Add header to table
	breakdownTable.appendChild(tableHeader);

	// Create corresponding table rows and table columns
	for (row of awardList){
		let tableRow = document.createElement("tr");

		let td1 = document.createElement("td");
		if (row[0] !== null){
			// Preload image
			(new Image()).src = row[0];

			// Create img element
			let td1Img = document.createElement("img");
			td1Img.src = row[0];
			td1.appendChild(td1Img);
		}
		tableRow.appendChild(td1);

		for (let i = 1; i < 4; i++){
			let td = document.createElement("td");
			td.innerHTML = row[i];
			tableRow.appendChild(td);
		}

		breakdownTable.appendChild(tableRow);
	}

	let finalRow = document.createElement("tr");

	let totalDollarsSpent = `~$${thousandSeperators((coinsSpent * minRatio + coinsSpent * maxRatio) / 2)}`;
	let totalDollarsReceived = `~$${thousandSeperators((coinsRecieved * minRatio + coinsRecieved * maxRatio) / 2)}`;

	for (let text of [
		"", `Total<br/>x${thousandSeperators(totalAwards)}`, `${thousandSeperators(coinsSpent)}¢<br/>${totalDollarsSpent}`, `${thousandSeperators(coinsRecieved)}¢<br/>${totalDollarsReceived}`,
	]){
		let td = document.createElement("td");
		td.innerHTML = text;
		td.classList.add("th");
		finalRow.appendChild(td);
	
	}

	// Add final row to table
	breakdownTable.appendChild(finalRow);

	// Add table to body
	document.body.appendChild(breakdownTable);

}
