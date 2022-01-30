//Joshua Brewster, Garrett Flynn   -   GNU Affero GPL V3.0 License
//import { streamUtils } from "./streamSession";

import { SubscriptionService } from '../../router/SubscriptionService'
import { MessageObject, UserObject } from '../../common/general.types';
import { safeStringify } from  '../../common/parse.utils';
import { randomId } from  '../../common/id.utils';

// TODO: Convert to SubscriptionService and mirror the backend network services
export class WebsocketClient extends SubscriptionService {

    name = 'websocket'
    service = 'websocket'

    subprotocols?: Partial<UserObject>
    connected = false;
    sendQueue: {[x:string]: Function[]} = {}
    streamUtils
    sockets: Map<string,any> = new Map()

    queue = {};

    origin = `client${Math.floor(Math.random()*10000000000000)}`; //randomid you can use

    constructor(
        subprotocols:Partial<UserObject>={},
        url?:URL|string
    ) {
        super()

        if (!subprotocols._id) subprotocols._id = randomId()
        this.subprotocols = subprotocols;
        
        if(url) this.addSocket(url, subprotocols)
    }

    //creates a url to be posted to the socket backend for parsing, mainly user info
    encodeForSubprotocol = (dict) => {
        let subprotocol = []

        if(dict._id) {
            dict.id = dict._id 
            delete dict._id
        }

        Object.keys(dict).forEach((str) => subprotocol.push(`brainsatplay.com/${str}/${dict[str]}?arr=` + Array.isArray(dict[str])))
        return encodeURIComponent(subprotocol.join(';'));

    }

    add = async (user, endpoint) => {
        return this.addSocket(endpoint, user)
    }

    addSocket(url:string|URL=new URL('https://localhost:80'), subprotocolObject=this.subprotocols) {
        let socket;

        if (!(url instanceof URL)) url = new URL(url)
        const remote = url.origin

        try {
            if (url.protocol === 'http:') {
            
                socket = new WebSocket(
                    'ws://' + url.host, // We're always using :80
                    this.encodeForSubprotocol(subprotocolObject));
                //this.streamUtils = new streamUtils(auth,socket);
            } else if (url.protocol === 'https:') {
                socket = new WebSocket(
                    'wss://' + url.host, // We're always using :80
                    this.encodeForSubprotocol(subprotocolObject));

                //this.streamUtils = new streamUtils(auth,socket);
            } else {
                console.log('invalid protocol');
                return undefined;
            }
        }
        catch(err) {
            console.error('Error with socket creation!',err);
            return undefined;
        }

        socket.onerror = (e) => {
            console.log('error', e);
        };

        socket.onopen = () => {
            console.log('websocket opened');
            this.connected = true;
            //this.streamUtils.info.connected = true;
            this.sendQueue[remote]?.forEach(f => f());
            this.sendQueue[remote] = []
        };

        socket.onmessage = this.onmessage
        socket.onclose = (message) => {
            this.connected = false;
            //this.streamUtils.info.connected = false;
            console.log('websocket closed');
        }

        // let id = randomId('socket')

        this.sockets.set(remote, socket);

        return remote

    }

    getSocket(remote?:string|URL) {
        if (typeof remote === 'string') remote = new URL(remote)
        if(!remote) return this.sockets.values().next().value;
        return this.sockets.get(remote.origin);
    }

    // //add a callback to a worker
    // async addFunction(functionName,fstring,origin,id,callback=(result)=>{}) {
    //     if(functionName && fstring) {
    //         if(typeof fstring === 'function') fstring = fstring.toString();
    //         let dict = {route:'addfunc',message:[functionName,fstring], id:origin}; //post to the specific worker
    //         if(!id) {
    //             this.sockets.forEach((s) => {this.send(dict,{id: s.id});});
    //             return true;
    //         } //post to all of the workers
    //         else return await this.send(dict,{callback,id});
    //     }
    //   }

    // async run(functionName:string,args:[]|object=[],id:string,origin:string,callback=(result)=>{}) {
    //     if(functionName) {
    //         if(functionName === 'transferClassObject') {
    //           if(typeof args === 'object' && !Array.isArray(args)) {
    //             for(const prop in args) {
    //               if(typeof args[prop] === 'object' && !Array.isArray(args[prop])) args[prop] = args[prop].toString();
    //             }
    //           }
    //         }
    //         let dict = {route:functionName, message:args, id:origin};
    //         return await this.send(dict,{callback, id});
    //     }
    // }

    // runFunction = this.run;
    
    // //a way to set variables on a thread
    // async setValues(values={}, id, origin) {
    //     if(id)
    //         return await this.run('setValues',values,id,origin);
    //     else {
    //         this.sockets.forEach((s) => {
    //         this.run('setValues',values,s.id,origin);
    //         });
    //         return true;
    //     } 
    // }

    send = (message:MessageObject, options: {
        callback?:Function
        remote?: string
        suppress?: boolean
    } = {}) => {
        return new Promise((resolve)=>{//console.log(message);
            const resolver = (res) => 
            {    
                if (options.callback) options.callback(res);
                resolve(res);
            }

            const callbackId = ''+Math.random();//randomId()
            if (typeof message === 'object'){
                if (Array.isArray(message)) message.splice(1, 0, callbackId); // add callbackId before arguments
                else message.callbackId = callbackId; // add callbackId key
            } // TODO: Handle string-encoded messsages

            this.queue[callbackId] = {resolve, suppress: options}

            let socket;
            const remote = new URL(options.remote)
            socket = this.getSocket(remote)
            // message = JSON.stringifyWithCircularRefs(message)

            if(!socket) return;

            let toSend = () => socket.send(safeStringify(message), resolver);
            if (socket.readyState === socket.OPEN) toSend();
            else {
                if (!this.sendQueue[remote.origin]) this.sendQueue[remote.origin] = []
                this.sendQueue[remote.origin].push(toSend);
            }
        });
    }

    post = this.send; //alias

    onmessage = (res) => {

        res = JSON.parse(res.data);
        // console.error('onmessage',res)

        //this.streamUtils.processSocketMessage(res);
    
        let runResponses = () => {
            this.responses.forEach((foo,i) => foo(res));
        }


        const callbackId = res.callbackId
        if (callbackId) {
            delete res.callbackId
            const item = this.queue[callbackId]
            if (item?.resolve) item.resolve(res) // Run callback
            if (!item?.suppress) runResponses()
            // runResponses() 
            delete this.queue[callbackId];
        } else {
            runResponses()
            this.defaultCallback(res);
        }

        // State.data.serverResult = res;

        // UI.platform.receivedServerUpdate(res);

    }

    addCallback(name='',callback=(args)=>{}) {
        if(name.length > 0 && !this.responses.has(name)) {
            this.responses.set(name, callback);
        }
        else return false;
    }

    removeCallback(name='') {
        this.responses.delete(name);
    }

    defaultCallback = (res) => {
        // console.error('default',res)
    }


    isOpen = (remote) => {
        let socket = this.getSocket(remote)
        if(socket) return socket.readyState === 1; 
        else return false;
    }

    close = (remote) => {
        let socket =  this.getSocket(remote)
        if(socket) return socket.close(); 
        else return false;
    }

    terminate = this.close; //alias
}