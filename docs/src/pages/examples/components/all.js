import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';
import styles from '../examples.module.css'

export default function AllExample({server, platform}) {
  
    const buttons = useRef(null);
    const output = useRef(null);

    let vals = {
      'add': 0
    }

    useEffect(async () => {

      // http.addRoute(customRoute)
      platform.subscribe((o) => {

        console.log('o', o)

        let data = o.message
        if (o.route === 'routes'){

        let divs = {}
        buttons.current.innerHTML = ''

        for (let route in data){
          const o = data[route]

          let test = o.route.split('/')
          let service = (test.length < 2) ? 'Base' : test[0]
          let name = (test.length < 2) ? test[0] : test[1]

          if (!divs[service]){
            divs[service] = document.createElement('div')
            divs[service].innerHTML = `<h2>${service}</h2>`
            divs[service].style.padding = '20px'
            buttons.current.insertAdjacentElement('beforeend', divs[service])
          }

          
          // o = {route: string, arguments: []}
          let button = document.createElement('button')
          button.className = 'button button--secondary button--lg'
          button.innerHTML = name
          button.onclick = ( ) => {
            let args = []
            if (o.route === 'routes') buttons.current.innerHTML = ''
            if (o.route === 'unsafe/addfunc') args = ['add', (_, [a, b=1]) => a + b]
            else if (o.route === 'add') args = [vals['add']]

            // Sending Over HTTP Response
            send(o.route, ...args)
          }

          divs[service].insertAdjacentElement('beforeend', button)
        }
      } else {
        
        // Subscription Responses
        if (!data?.error) output.current.innerHTML = JSON.stringify(vals[o.route] = data)
        else output.current.innerHTML = data.error

      }
      }, {protocol: 'http', routes: ['routes']})
    });

    async function send(route, ...args){
      return await platform.send(route, ...args).then(res => {
        if (!res?.error && route != 'routes') output.current.innerHTML = JSON.stringify(vals[route] = res)
        else output.current.innerHTML = res.error

      }).catch(err => {
        output.current.innerHTML = err.error
      })

    }
  
    return (
      <header className={clsx('hero hero--primary')}>
        <div className="container">
          <h1 className="hero__title">All Routes</h1>
          <div className={styles.terminal}><span ref={output}></span></div>
          <div ref={buttons}>
          </div>
        </div>
      </header>
    );
  }
  