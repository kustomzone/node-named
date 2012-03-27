var fs = require('fs');
var path = require('path');
var ipaddr = require('ipaddr.js');
var protocol = require('./protocol');


// Low hanging fruit for a rewrite
  
var parseName = function (name) {
	if (typeof(name) !== 'string') 
		throw new TypeError('name (string) is required');

	// validate name XXX
  return name.split(/\./);
}

var parseIP4 = function (addr) {
	var d, t;
	if (typeof(addr) !== 'string')
		throw new TypeError('addr (string) is required');

	// turns a dotted-decimal address into a UInt32
	t = addr.split(/\./);
	d = (t[0] << 24 | t[1] << 16 | t[2] << 8 | t[3]);
  return d;
}

var parseIP6 = function (addr) {
	if (typeof(addr) !== 'string')
		throw new TypeError('addr (string) is required');
  var addr;

	try {
		addr = ipaddr.parse(addr);
		return addr.parts;
	}
	catch (e) {
		return false;
	}

}

var Store = function (opts) {
	if (typeof(opts) !== 'object') {
		throw new TypeError('opts (object) is missing');
	}

  this._db = {};
  this._domains = {};
  this._dbFile = path.join(__dirname + '/' + opts.dbFile);
  
	var self = this;

}

Store.prototype._load = function () {
	var config;
  try {
  	config = JSON.parse(fs.readFileSync(this._dbFile, 'utf8'));
  }
  catch (err) {
    throw new Error("could not load db " + this._dbFile);
  }

	// validate domains XXX
  this._domains = config._domains;

  
  for (var i in config._domains) {
  	var name, hosts, records = {};
  
		name = config._domains[i];
  	records = config[name];
	
		// parse SOA record
    records.soa.host = parseName(records.soa.host);
    records.soa.admin = parseName(records.soa.admin);

    // parse NS records
    for (var i in records.ns) {
    	var r = records['ns'][i];
    	r.data = parseName(r.data);
		}

    // parse srv records
		for (var t in records.srv) {
			var s = records.srv[t];
			for (var i in s) {
				s[i].data = parseName(s[i].data);
			}
		}
	
		// parse MX
	  for (var i in records.mx) {
	  	var r = records['mx'][i];
	  	r.exchange = parseName(r.exchange);
	  }

    // parse Hosts
    for (var i in records.hosts) {
    	var h = records['hosts'][i];
    	for (var n in h) {
				var r = h[n];
				switch(r.type) {
					case "CNAME":
						r.type = protocol.QTYPE_CNAME;
						r.data = parseName(r.data);
						break;
					case "A":
						r.type = protocol.QTYPE_A;
						r.data = parseIP4(r.data);
						break;
					case "AAAA":
						r.type = protocol.QTYPE_AAAA;
						r.data = parseIP6(r.data);
						break
				}
			}
    }

    // add records to store db
    this._db[name] = records;

  }
}

Store.prototype.get = function get (opts) {
  var name, host, domain, records, rr = [];
	
	if (typeof(opts) !== 'object') {
		throw new TypeError('opts (object) is missing');
	}

	//XXX This wont work for names with more than one delimeter
  host = opts.name[0];
  domain = opts.name[opts.name.length - 2] + '.' + opts.name[opts.name.length - 1];

  if (!this._db[domain]) {
		return { error: { message: 'Non existent domain', code: protocol.DNS_ENONAME } };
  }

  records = this._db[domain];

  switch(opts.type) {
    case protocol.QTYPE_A:
      // if A is requested then we return all A records associated
      // with a request. If the resource is a CNAME then we include
      // all the appropriate A records for the CNAME in the ADDITIONAL
     
      if (!records.hosts[host]) 
				return { error: { message: 'No entry', code: protocol.DNS_ENONAME } };

			var t, results = [];
			t = records.hosts[host];
			
			for (i in t) {
				var record;
				if (t[i].type !== protocol.QTYPE_A)
					continue;

				record = {
					name: opts.name,
					rtype: t[i].type,
					rclass: 0x01,
					rttl: t[i].ttl || records.soa.ttl,
					rdata: t[i].data
				}
				results.push(record);
			} 

			return { records: results };

      break;
    
    case protocol.QTYPE_CNAME:
      // if CNAME is requested we return the CNAME or "not found"
      // No additional records are returned
      if (!records.hosts[host])
				return { error: { message: 'No entry', code: protocol.DNS_ENONAME } };

			var t, result;
			t = recordshosts[host][0]; // only one CNAME 
		 
			if (!t || t.type !== protocol.QTYPE_CNAME)
				return { error: { message: 'No entry', code: protocol.DNS_ENONAME } };

			var result = {
				name: opts.name,
				rclass: 0x01,
				rtype: t.type,
				rttl: t[i].ttl || records.soa.ttl,
				rdata: t.data
			}
			return { records: [result] };
      
      break;
    
    case protocol.QTYPE_AAAA:
      // only return AAAA record or CNAME and associated AAAA records
      if (!records.hosts[host])
				return { error: { message: 'No entry', code: protocol.DNS_ENONAME } };
      	
			var t, results = [];
			t = records.hosts[host];
			
			for (i in t) {
				var record;
				if (t[i].type !== protocol.QTYPE_AAAA)
					continue;

				record = {
					name: opts.name,
					rtype: t[i].type,
					rclass: 0x01,
					rttl: t[i].ttl || records.soa.ttl,
					rdata: t[i].data
				}
				results.push(record);
			} 

			return { records: results };

      break;
   
   	case protocol.QTYPE_TXT:
      // simply return the text string for the domain
			return { error: { code: protocol.DNS_ENOTIMP } };
      break;
    
    case protocol.QTYPE_NS:
      // return a list of all authoritative nameservers
			return { error: { code: protocol.DNS_ENOTIMP } };
      break;
    
    case protocol.QTYPE_MX:
      // return a list of all MX records and their priorities
      
      if (!records.mx) 
				return { error: { message: 'No entry', code: protocol.DNS_ENONAME } };
			var t, results = [];
			t = records.mx;
			
			for (i in t) {
				var record = {
					name: opts.name,
					rclass: 0x01,
					rtype: protocol.QTYPE_MX,
					rttl: t[i].ttl || records.soa.ttl,
					rdata: t[i]
				}
				results.push(record);
			} 

			return { records: results };

      break;

		case protocol.QTYPE_SOA:
      // return the Start Of Authority record
      var record;
      
      record = {
				name: domain.split(/\./),
				rtype: protocol.QTYPE_SOA,
				rclass: 0x01,
				rttl: 0, // per RFC
				rdata: records['soa']
			};
			
      return { records: [ record ] };
      break;
		
		case protocol.QTYPE_SRV:
      var record;

      break;
    
    default:
      // we dont support any other queries
			return { error: { message: 'Not Implemented', code: protocol.DNS_ENOTIMP } };
      break;
  }
  
}

// pseudo-singleton
var instance;

var createStore = function (opts) {
	var getStore = function () {
		if (instance === undefined)
			instance = new Store(opts)
		return instance;
	}
	return getStore();
};

module.exports = {
	create: createStore
};