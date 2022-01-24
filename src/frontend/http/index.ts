import { SubscriptionService, createRoute } from "@brainsatplay/liveserver-common";

class HTTPClient extends SubscriptionService {

    name = 'http'
    service = 'HTTPService'

    constructor() {
        super()
    }

    add = (user, endpoint) => {
        return new Promise(resolve => {

            this.reference = new EventSource(createRoute(endpoint, this.remote))
            this.reference.onopen = () => {
                this.reference.onmessage = (event) => {
                let data = JSON.parse(event.data)

                // Ensure IDs are Linked
                if (data.route === 'events/subscribe'){
                    this.reference.onmessage = (event) => {
                        this.responses.forEach(f => f(event))
                    }
                    resolve(data.message)
                    // onopen(this.reference)
                }
            }
        }
    })
}
}


let http = new HTTPClient()

// Export Instantiated Session
export {http, HTTPClient}
export default http