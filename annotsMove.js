/*
2018-09-10 
kaTaVasija inspired by Miroque MD24 way

The goal.
In a Nhibernate *.java config-file move annotations from methods to properties
resulting *.v2.java
TODO: update the same file, not to create new one?

Usage: >node annotsMove.js filename.java

couldn't quickly make for multiple files because though multiple lineReaders, 
they close at one moment (or I misunderstand smth :( )

Windows: tested
Linux: not tested

*/
// main 
const inputParams = process.argv;
const fs = require('fs');

var lineWords = [];
var properties = {};
var propertyNamesArray = [];
var lineNo = 0;
var annotationsStack = [];
var fileName = "";
var fileV2Name = "";
// destination file content (lines)
var fileV2Content = [];
// annotation line flag
var annotationSemaphore = false;
var annotationStackFirstLineNo = 0;
// delete no items splicing array
const DELETE_NO_ELEMS = 0;

if (inputParams.length <= 2) {
    console.log("Usage: " + __filename + "filename0 [,filename1,..]");
    process.exit(-1);
} else {
	/* TODO:
		single parameter: wildcard matching files 
	*/
	for (let i = 2; i< inputParams.length; i++) {
		let fileCandidate = inputParams[i];
		let filesLineReader = [];
		if (fs.existsSync(fileCandidate)) {
			filesLineReader[i] = processFile(fileCandidate);
		} else {
			console.log("file " + fileCandidate + " not found");
		}
	}
}

function initFileParser(filename) {
	// store src filename (*.java)
	fileName = filename;
	// get dst filename (*.v2.java) 
	var fileV2NameParts = fileName.split(".")
	const FILE_NAME_EXT_POS = fileV2NameParts.length - 1;
	
	fileV2NameParts.splice(FILE_NAME_EXT_POS, DELETE_NO_ELEMS, "v2");
	fileV2Name = fileV2NameParts.join(".");
	
	// init content
	fileV2Content.length = 0;
	// init properties line numbers map
	properties = {};
	// init properties order array
	propertyNamesArray = [];
	
	lineNo = 0;
}

function initLineParser() {
	// trunc line words
	lineWords.length = 0;
}

function processFile(filename) {
	initFileParser(filename);
	
	var lineReader = require('readline').createInterface({
		input: fs.createReadStream(fileName)
	});
	
	lineReader.on('line', processFileLine);
	lineReader.on('close', dumpV2Content);
	return lineReader;
}

function processFileLine(line) {
	//console.log('Line from file:', line);
	initLineParser();
	// get line words
	lineWords = line.split(/\s/);
	// check for property
	checkProperty();
	// check for next annotation present or all annotations need dump
	checkAnnotationsStack();
	
	if (!annotationSemaphore) {
		fileV2Content.push(line);
	}
	lineNo++;
}

function insertAnnotationsIntoContent(annotLineNo, propertyName = "") {
	
	let annotLineNumber = annotLineNo;
	let countAnnotations = 0;
	
	for (let i = 0; i< annotationsStack.length; i++) {
		const annotationLine = annotationsStack[i];
		fileV2Content.splice(annotLineNumber + i, DELETE_NO_ELEMS, annotationLine);
		countAnnotations++;
	}

	// when moving annotations to properties , shift all next properties lines
	if (propertyName.length) {
		const propertyIndex = propertyNamesArray.indexOf(propertyName);
		if (propertyIndex > - 1) {
			for (let i = propertyIndex + 1; i< propertyNamesArray.length; i++) {
				properties[propertyNamesArray[i]]+=countAnnotations;
			}
		}
	}
	// set empty annotationsStack
	annotationsStack.length = 0;
}

function checkProperty() {
	// search for pattern "private Type propertyName;"
	// const propertyPattern = /private /; //enough?
	const propertyPattern = /private {1,}[A-Za-z<>]{1,} {1,}[A-Za-z]{1,} {0,}\;$/;	
	if (lineWords.length >= 3) {
		if (propertyPattern.test(lineWords.join(" "))) {
			// property name - last word in line without ";"
			const lastWord = lineWords[lineWords.length - 1];
			const propertyName = lastWord.substr(0, lastWord.length - 1);
			if (propertyName) {
				// store line number of property definition in map-object
				properties[propertyName] = lineNo;
				// store property Name in order
				propertyNamesArray.push(propertyName);
			} else {
				/* TODO: decide this possible and needed? */
				console.log("lost property on line number " + lineNo+1 + ":'" + lineWords.join(" ") + "'");
			}
			
			// in case of property defintion , insert annotations where they were
			if (annotationsStack.length > 0) {
				insertAnnotationsIntoContent(annotationStackFirstLineNo);
			}
		}
	}
}

function checkAnnotationsStack() {
	const annotationCandidate = lineWords.join(" ");
	const annotationPattern = /\s*@/;
	// annotation in place
	if (annotationPattern.test(annotationCandidate)) {
		if (!annotationSemaphore) {
				annotationSemaphore = true;
				// store annotation position
				annotationStackFirstLineNo = lineNo;
		}
		annotationsStack.push(annotationCandidate);
	// no annotation in place
	} else {
		/*
			if annotationsStack is not empty
			check if need to pull annotations from stack;
			destination property is found by succesive method
			which "return propertyName;";
			in case of class header " class " insert annotations where they were;
			(the same for property definition (see func. checkProperty))
		*/
		// annotationsStack is not empty
		if (annotationsStack.length > 0) {
			// class header
			if (lineWords.includes("class")) {
				insertAnnotationsIntoContent(annotationStackFirstLineNo);
			}
			// get propertyName - next word after "return"
			// lineWords.join(" ").indexOf("return") >= 0
			if (lineWords.includes("return")) {
				/*  TODO: correct and quick search of "return" position
					may be "<tab><tab>return" etc.
				*/
				/*
				let returnPos = 0;
				for (let i = 0; i < lineWords.lenght; i++) {
					 let currentWord = lineWords[i];
					 if (currentWord.indexOf("return") > 0) {
						returnPos = i;
						break;
					 }
				}
				*/
				const returnPos = lineWords.indexOf("return");
				const propertyPos = returnPos + 1;
				let propertyName = lineWords[propertyPos];
								
				// remove last ";" , this.
				if (propertyName.indexOf(";") > 0)
					propertyName = propertyName.substr(0, propertyName.indexOf(";")).replace("this.");
				
				if (propertyName) {
					// check property in map
					// console.log(propertyName);
					const propertyDefinitionLineNo = properties[propertyName];
					if (propertyDefinitionLineNo > 0) {
							// the goal: move annotations to property definition
							insertAnnotationsIntoContent(propertyDefinitionLineNo, propertyName);
					// propertyName not found in map
					} else {
							insertAnnotationsIntoContent(annotationStackFirstLineNo);
					}
				// 	propertyName is empty - insert annotations where they were
				} else {
					insertAnnotationsIntoContent(annotationStackFirstLineNo);
				}
			}
		}
		annotationSemaphore = false;
	}
}

function dumpV2Content() {
	const filev2 = fs.createWriteStream(fileV2Name);
	var res = "Done with file '" + fileName + "', see '" + fileV2Name + "'";
	var errata = "Error writing '" + fileV2Name + "'";
	filev2.on('error', function(err) { /*TODO: error handling */ res = errata});
	fileV2Content.forEach(function(v) { filev2.write(v + '\n'); });
	filev2.end();
	console.log(res);
}
