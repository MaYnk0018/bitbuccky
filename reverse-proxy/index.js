const express = require('express');
const app = express();
const httpProxy = require('http-proxy');

const PORT = 8000;
const proxy = httpProxy.createProxy();
const BASE_URL = 'https://gitku.s3.ap-south-1.amazonaws.com/__output';

app.use((req, res) => {
    const path = req.url;
    console.log("path to which proxy goes", path);
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];
    console.log("subdomain", subdomain);
    
    const target = `${BASE_URL}/${subdomain}`;
    console.log("Proxying to:", target);
    
    return proxy.web(req, res, { 
        target: target,
        changeOrigin: true 
    });
});

proxy.on('proxyReq', function(proxyReq, req, res, options) {
    console.log("proxyReq", proxyReq.path);
    const url= req.url;
    console.log("url", url);
    if(url=== '/'){
        proxyReq.path+='index.html';
        console.log("proxyReq", proxyReq.path);
    }
});

// Add error handling for proxy
proxy.on('error', (err, req, res) => {
    console.error('Proxy Error:', err);
    res.status(500).send('Proxy Error');
});

// Add stderr handling
process.stderr.on('data', (data) => {
    console.error(`[Proxy Error] ${data.toString().trim()}`);
});

app.listen(PORT, () => {
    console.log(`reverse-proxy is running on port ${PORT}`);
});