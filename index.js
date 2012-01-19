var sys = require('sys');
var fs = require('fs');

function Logger() {
    this.outputs = []
}

function merge(dfrom,dto) {
    for (var k in dfrom) { 
	dto[k] = dfrom[k]
    }
}

Logger.prototype.buildlogentry = function(array) {
    var ret = {}
    array.reverse()
//    console.log(array)
    if (array.length > 1) {
	ret.area = array.pop()
    }    

    if (array.length > 1) {
	ret.loglevel = array.pop()
    }


    if (array.length >= 1) {
	ret.message = array.pop()
    }

    var payload = {}
    for (var entry in array) {
//	console.log(typeof(array[entry]),sys.inspect(entry))
	if (typeof(array[entry]) == 'object') {
	    for (var subentry in array[entry]) {
		payload[subentry] = array[entry][subentry]
	    }
	} else {
	    payload[array[entry]] = true
	}
    }

    ret.payload = payload
    ret.time = new Date().getTime() 

    return ret

}

Logger.prototype.log = function() {
    var array = []
    for (var x in arguments) {
	array.push(arguments[x])
    }
    var logentry = this.buildlogentry(array)


    this.outputs.forEach( function(output) {
	output.push(logentry)
    })
}


function ConsoleOutput() {
    this.area = {}
    this.area['default'] = 'green'

    this.loglevel = {}
    this.loglevel['default'] = 'cyan'
    this.loglevel['info'] = 'green'
    this.loglevel['important'] = 'red'
    

}

ConsoleOutput.prototype.push = function(logentry) {
    var self = this    
    var out = new Date(logentry.time).toUTCString() +  " "


    function colouredpart(name,logentry) {
	var out = "- "
	if (logentry[name]) { 
	    if (!self[name][logentry[name]]) { var colour = self.colours[self[name].default] } else { var colour = self.colours[self[name][logentry[name]]] }
	    
	    out += colour + logentry[name] + self.colours.reset + " "
	}
	return out
    }

    out += colouredpart('area',logentry)
    out += colouredpart('loglevel',logentry)
    out += "- "
    if (logentry.message) {
	out += logentry.message
    }

    if (Object.keys(logentry.payload).length > 0) {
	out += " - " +  sys.inspect(logentry.payload)
    }
    
    console.log(out)
}



ConsoleOutput.prototype.colours = {
    reset:   "\x1B[0m",
    grey:    "\x1B[0;30m",
    red:     "\x1B[0;31m",
    green:   "\x1B[0;32m",
    yellow:  "\x1B[0;33m",
    blue:    "\x1B[0;34m",
    magenta: "\x1B[0;35m",
    cyan:    "\x1B[0;36m",
    white:   "\x1B[0;37m",
    boldgrey: "\x1B[1;30m",
    boldred:     "\x1B[1;31m",
    boldgreen:   "\x1B[1;32m",
    boldyellow:  "\x1B[1;33m",
    boldblue:    "\x1B[1;34m",
    boldmagenta: "\x1B[1;35m",
    boldcyan:    "\x1B[1;36m",
    boldwhite:   "\x1B[1;37m",
}


function FileOutput(file) {
    this.file = file
    this.interestingparts = ['area','loglevel']
}


FileOutput.prototype.push = function(logentry) {
    var self = this    
    var out = new Date(logentry.time).toUTCString() +  " - "

    out += logentry.area
    out += " - "

    out += logentry.loglevel
    out += " - "

    if (logentry.message) {
	out += logentry.message
    }

    if (Object.keys(logentry.payload).length > 0) {
	out += " - " +  sys.inspect(logentry.payload)
    }

    out += "\n"

    fs.open(this.file, 'a', 666, function( e, id ) {
	fs.write( id, out, null, 'utf8', function(){
	    fs.close(id, function(){})
	})
    })
}


function MongoStats(collection,dataextractors,minres,maxres) {
    this.collection = collection
    this.dataextractors = dataextractors
    
    this.res = []

    var res = minres
//    console.log (res,maxres)
    while (res <= maxres) {
	this.res.push(res)
	res *= 2
//	console.log("res: ",res)
    }
}

MongoStats.prototype.addextractor = function(dataextractor) { 
    this.dataextractors.push ( dataextractor )
}


MongoStats.prototype.push = function(logentry) {
    var self = this
    var data = { "$inc": {} , "$set" : {} }
    var dirty = false
    this.dataextractors.forEach(function(extractor) {
	var res = extractor(logentry)
	if (res) {

	    if (res["$inc"]) {
		dirty = true
		merge(res["$inc"],data["$inc"])
	    }
	    
	    if (res["$set"]) {
		dirty = true
		merge(res["$set"],data["$set"])
	    }
	}
    })

    if (dirty) { 
	console.log(new Date(logentry.time),data)
	this.res.forEach( function(res) {
	    self.pushbucket(self.getbucketname(logentry.time,res),data)
	})
    }
}

//item._id.generationTime

MongoStats.prototype.getbucketname = function(time,res) {
    return { res : res, time: new Date(time - (time % res)).getTime() }
}

MongoStats.prototype.pushbucket = function(bucketname,data) {
    var self = this
    
    var output = {}

//    console.log("pushing to bucket",bucketname,data)

    self.collection.update(bucketname, data,{ upsert : true } )


/*
    self.collection.findOne(bucketname,function(err,_entry) { 
	if (!_entry) { var entry = {} } else { var entry = _entry }
	
	for (var key in data) {
	    if (entry[key]) { 
		entry[key] += data[key]
	    } else {
		entry[key] = data[key]
	    }
	}

	if (!_entry) {
	    entry.res = bucketname.res
	    entry.time = bucketname.time
	    self.collection.insert(entry)
	} else {
	    self.collection.update(entry)
	}
    })
*/

}




function MongoOutput(collection) {
    this.collection = collection
}

MongoOutput.prototype.push = function(logentry) {
    this.collection.insert(logentry)
}


module.exports.Logger = Logger
module.exports.ConsoleOutput = ConsoleOutput
module.exports.FileOutput = FileOutput
module.exports.MongoOutput = MongoOutput
module.exports.MongoStats = MongoStats


