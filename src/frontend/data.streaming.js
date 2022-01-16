//Allows you to stream data asynchronously with automatic buffering settings
//This hooks in with functions on the remote service backend.
export class dataStreaming {
	constructor(socket, userinfo) {

		this.socket = socket;
		this.user = userinfo;

		this.LOOPING = true;
		this.delay = 50; //ms update throttle

		this.state = new StateManager(
			{
				commandResult: {},
				sessionInfo: undefined,
			},
			undefined,
			false
		); //triggered-only state
	
		this.streamSettings = {};

		this.streamFunctions = {
			allLatestValues:(prop,setting)=>{
				let setting = setting;
				let result;
				if(Array.isArray(prop)) {
					result = prop.slice(setting.lastRead);
					setting.lastRead = prop.length;
				}
				else if (typeof prop === 'object') {
					result = {};
					for(const p in prop) {
						if(Array.isArray(prop[p])) {
							if(typeof setting === 'number') setting = {[p]:0}; //convert to an object for the sub-object keys
							result[p] = prop[p].slice(setting[p].lastRead);
							setting[p].lastRead = prop[p].length;
						}
						else result[p] = prop[p];
					}
				}
				else result = prop;

				return result;

				
			},
			latestValue:(prop,setting)=>{
				let setting = setting;
				let result;
				if(Array.isArray(prop)) {
					result = prop[prop.length-1];
					setting.lastRead = prop.length;
				}
				else if (typeof prop === 'object') {
					result = {};
					for(const p in prop) {
						if(Array.isArray(prop[p])) {
							if(typeof setting === 'number') setting = {[p]:0}; //convert to an object for the sub-object keys
							result[p] = prop[prop.length-1];
							setting[p].lastRead = prop[p].length;
						}
						else result[p] = prop[p];
					}
				}
				else result = prop;

				return result;
			},
		};

		this.STREAMLATEST = 0;
		this.STREAMALLLATEST = 1;
			
	//	 stream1:{
	// 		object:{}, 		// Object we are buffering data from
	// 		tag:'stream1',			// tag added to keys being passed
	//		keys:['key'], 	// Keys of the object we want to buffer into the stream
	// 		settings:{
	//      	callback:0, 	// Default data streaming mode for all keys
	//			key:{
	//				callback:0 //specific modes for specific keys
	// 				lastRead:0,	
	//			}
	//	 }
		
	}

	setStreamFunc(name,key,callback=(input)=>{}) {
		if(!this.streamSettings[name].settings[key]) 
			this.streamSettings[name].settings[key] = {lastRead:0};
		
		if(callback === this.STREAMLATEST) 
			this.streamSettings[name].settings[key].callback = this.streamFunctions.latestValue; //stream the latest value 
		else if(callback === this.STREAMALLLATEST) 
			this.streamSettings[name].settings[key].callback = this.streamFunctions.allLatestValues; //stream all of the latest buffered data
		else if (typeof callback === 'string') 
			this.streamSettings[name].settings[key].callback = this.streamFunctions[callback]; //indexed functions
		else if (typeof callback === 'function')
			this.streamSettings[name].settings[key].callback = callback; //custom function
		
	}

	addStreamFunc(name,callback=()=>{}) {
		this.streamFunctions[name] = callback;
	}

	setStream(name,object={},keys=[],settings={}) {

		if(!settings.mode) settings.mode = 0;

		keys.forEach((prop) => {
			settings[prop].lastRead = 0;
			if(!settings[prop].callback) settings.callback = this.STREAMALLLATEST; //streams all the latest buffered data for the key
		});
		
		this.streamSettings[name] = {
			object,
			tag:name,
			keys,
			settings
		};

	}

	removeStream(name,key) {
		if(name && !key) delete this.streamSettings[name];
		else if (key) {
			let idx = this.streamSettings[name].keys.indexOf(key);
			if(idx > -1) 
				this.streamSettings[name].keys.splice(idx,1);
			if(this.streamSettings[name].settings[key]) 
				delete this.streamSettings[name].settings[key];
		}
	}

	streamLoop() {
		if(this.LOOPING) {
			let updateObj = {
				id:this.user.id,
				userData:{}
			};

			for(const prop in this.streamSettings) {
				this.streamSettings[prop].keys.forEach((key) => {
					if(this.streamSettings[prop].settings[key]) {
						let data = this.streamSettings[prop].settings[key].callback(this.streamSettings[prop].object[key],this.streamSettings[prop].settings[key]);
						updateObj.userData[key+'_'+this.streamSettings[prop].tag] = data;
					}
				});
			}

			if(Object.keys(updateObj.userData).length > 0)	
				this.socket.send(JSON.stringify(updateObj));
			
			setTimeout(()=>{this.streamLoop()},this.delay);
		}
	}

}



//OLDDDDD
class streamSession {
	constructor(socket) {

		this.deviceStreams = [];

		this.info = {
			subscriptions: info.subscriptions,
			streaming: false,
			deviceStreamParams: [],
			nDevices: 0,
			appStreamParams: [],
			streamCt: 0,
			streamLoopTiming: 50
		};

		this.streamTable = []; //tags and callbacks for streaming
		this.socket = socket;

		this.configureDefaultStreamTable();
	}

	configureDefaultStreamTable(params = []) {
		//Stream table default parameter callbacks to extract desired data from the data atlas
		let getEEGChData = (device, channel, nSamples = 'all') => {
			let get = nSamples;
			if (device?.info?.useAtlas === true) {
				let coord = false;
				if (typeof channel === 'number') {
					coord = device.atlas.getEEGDataByChannel(channel);
				}
				else {
					coord = device.atlas.getEEGDataByTag(channel);
				}
				if (coord !== undefined) {
					if (get === 'all') {
						if (coord.count === 0) return undefined;
						get = coord.count - coord.lastRead;
						coord.lastRead = coord.count; //tracks count of last reading for keeping up to date
						if (get === 0) return undefined;
					}
					if (coord.filtered.length > 0) {
						let times = coord.times.slice(coord.times.length - get, coord.times.length);
						let samples = coord.filtered.slice(coord.filtered.length - get, coord.filtered.length);
						return { times: times, samples: samples };
					}
					else if (coord.raw.length > 0) {
						let times = coord.times.slice(coord.times.length - get, coord.times.length);
						let samples = coord.raw.slice(coord.raw.length - get, coord.raw.length);
						return { times: times, samples: samples };
					}
					else {
						return undefined;
					}
				}
				else {
					return undefined;
				}
			}
		}

		let getEEGFFTData = (device, channel, nArrays = 'all') => {
			let get = nArrays;
			if (device?.info?.useAtlas === true) {
				let coord = false;
				if (typeof channel === 'number') {
					coord = device.atlas.getEEGFFTData(channel);
				}
				else {
					coord = device.atlas.getEEGDataByTag(channel);
				}
				if (coord !== undefined) {
					if (get === 'all') {
						if (coord.fftCount === 0) return undefined;
						get = coord.fftCount - coord.lastReadFFT;
						coord.lastReadFFT = coord.fftCount;
						if (get === 0) return undefined;
					}
					let fftTimes = coord.fftTimes.slice(coord.fftTimes.length - get, coord.fftTimes.length);
					let ffts = coord.ffts.slice(coord.ffts.length - get, coord.ffts.length);
					return { times: fftTimes, ffts: ffts };
				}
				else {
					return undefined;
				}
			}
		}

		let getEEGBandpowerMeans = (device, channel) => {
			if (device?.info?.useAtlas === true) {
				let coord = false;

				coord = device.atlas.getLatestFFTData(channel)[0];

				if (coord !== undefined) {
					return { time: coord.time, bandpowers: coord.mean };
				}
				else {
					return undefined;
				}
			}
		}

		let getEEGCoherenceBandpowerMeans = (device, channel) => {
			if (device?.info?.useAtlas === true) {
				let coord = false;

				coord = device.atlas.getLatestCoherenceData(channel);

				if (coord !== undefined) {
					return { time: coord.time, bandpowers: coord.mean };
				}
				else {
					return undefined;
				}
			}
		}

		let getEEGBandpowerSlices = (device, channel) => {
			if (device?.info?.useAtlas === true) {
				let coord = false;

				coord = device.atlas.getLatestFFTData(channel)[0];

				if (coord !== undefined) {
					return { time: coord.time, bandpowers: coord.slice };
				}
				else {
					return undefined;
				}
			}
		}

		let getEEGCoherenceBandpowerSlices = (device, channel) => {
			if (device?.info?.useAtlas === true) {
				let coord = false;

				coord = device.atlas.getLatestCoherenceData(channel)[0];

				if (coord !== undefined) {
					return { time: coord.time, bandpowers: coord.slice };
				}
				else {
					return undefined;
				}
			}
		}

		let getCoherenceData = (device, tag, nArrays = 'all') => {
			let get = nArrays;
			if (device?.info?.useAtlas === true) {
				let coord = device.atlas.getCoherenceByTag(tag);
				if (coord !== undefined) {
					if (get === 'all') {
						if (coord.fftCount === 0) return undefined;
						get = coord.fftCount - coord.lastRead;
						coord.lastRead = coord.fftCount;
						if (get === 0) return undefined;
					}
					let cohTimes = coord.times.slice(coord.fftTimes.length - get, coord.fftTimes.length);
					let ffts = coord.ffts.slice(coord.ffts.length - get, coord.ffts.length);
					return { times: cohTimes, ffts: ffts };
				}
				else {
					return undefined;
				}
			}
		}

		let getHEGData = (device, tag = 0, nArrays = 'all', prop = undefined) => {
			let get = nArrays;
			if (device?.info?.useAtlas === true) {
				let coord = device.atlas.getDeviceDataByTag('heg', tag);
				if (get === 'all') {
					get = coord.count - coord.lastRead;
					coord.lastRead = coord.count;
					if (get <= 0) return undefined;
				}
				if (coord !== undefined) {
					if (prop !== undefined) {
						let times = coord.times.slice(coord.times.length - get, coord.times.length);
						let data = coord[prop].slice(coord.ffts.length - get, coord.ffts.length);
						let obj = { times: times }; obj[prop] = data;
						return obj;
					}
					else return coord;
				}
				else {
					return undefined;
				}
			}
		}

		this.streamTable = [
			{ prop: 'eegch', callback: getEEGChData },
			{ prop: 'eegfft', callback: getEEGFFTData },
			{ prop: 'eegcoherence', callback: getCoherenceData },
			{ prop: 'eegfftbands', callback: getEEGBandpowerMeans },
			{ prop: 'eegcoherencebands', callback: getEEGCoherenceBandpowerMeans },
			{ prop: 'eegfftbandslices', callback: getEEGBandpowerSlices },
			{ prop: 'eegcoherencebandslices', callback: getEEGCoherenceBandpowerSlices },
			{ prop: 'hegdata', callback: getHEGData }
		];

		if (params.length > 0) {
			this.streamTable.push(...params);
		}
	}

	addStreamFunc(name = '', callback = () => { }) {
		this.streamTable.push({ prop: name, callback: callback });
	}

	removeStreamFunc(name = '') {
		this.streamTable.find((o, i) => {
			if (o.prop === name) {
				return this.streamTable.splice(i, 1);
			}
		})
	}

	configureStreamParams(params = [['prop', 'tag']]) { //Simply defines expected data parameters from the user for server-side reference
		let propsToSend = [];
		params.forEach((param, i) => {
			propsToSend.push(param.join('_'));
		});
		this.socket.send(JSON.stringify({cmd:'addProps',args:[propsToSend]}));
	}

	//pass array of arrays defining which datasets you want to pull from according to the available
	// functions and additional required arguments from the streamTable e.g.: [['eegch','FP1'],['eegfft','FP1']]
	getDataForSocket = (device = undefined, params = [['prop', 'tag', 'arg1']]) => {
		let userData = {};
		params.forEach((param, i) => {
			this.streamTable.find((option, i) => {
				if (param[0] === option.prop) {
					let args;
					if (device) args = [device, ...param.slice(1)];
					else args = param.slice(1);
					let result = (args.length !== 0) ? option.callback(...args) : option.callback()
					if (result !== undefined) {
						if (param[2] !== 'ignore'
						) {
							userData[param.join('_')] = result;
						}
					}
					return true;
				}
			});
		});

		return userData;
		// if(Object.keys(streamObj.userData).length > 0) {
		// 	this.socket.send(JSON.stringify(streamObj));
		// }
	}

	streamLoop = (prev = {}) => {
		let streamObj = {
			id: this.id,
			userData: {}
		}
		if (this.info.streaming === true && this.socket.readyState === 1) {

			this.deviceStreams.forEach((d) => {
				if (this.info.nDevices < this.deviceStreams.length) {
					if (!streamObj.userData.devices) streamObj.userData.devices = [];
					streamObj.userData.devices.push(d.info.deviceName);
					this.info.nDevices++;
				}
				let params = [];
				this.info.deviceStreamParams.forEach((param, i) => {
					if (this.info.deviceStreamParams.length === 0) { console.error('No stream parameters set'); return false; }
					if (param[0].indexOf(d.info.deviceType) > -1) {
						params.push(param);
					}
				});
				if (params.length > 0) {
					Object.assign(streamObj.userData, this.getDataForSocket(d, params));
				}
			});
			Object.assign(streamObj.userData, this.getDataForSocket(undefined, this.info.appStreamParams));
			//if(params.length > 0) { this.sendDataToSocket(params); }

			if (this.info.subscriptions.length > 0) { // Only stream if subscription is established
				if (Object.keys(streamObj.userData).length > 0) {
					this.socket.send(JSON.stringify(streamObj));
				}
			}

			this.info.streamCt++;
			setTimeout(() => { this.streamLoop(); }, this.info.streamLoopTiming);
		}
		else {
			this.getDataForSocket(undefined, this.info.appStreamParams)
			this.info.streamCt = 0;
			setTimeout(() => { this.streamLoop(); }, this.info.streamLoopTiming);
		}
	}
}