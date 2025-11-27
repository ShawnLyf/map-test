const fetch = require('node-fetch');

/**
 * Azure Function to generate SLIP authentication tokens
 * This keeps credentials secure on the server-side
 */
module.exports = async function (context, req) {
    context.log('SLIP token generation requested');

    // Check if a static/permanent token is configured
    const staticToken = process.env.SLIP_STATIC_TOKEN;

    if (staticToken) {
        // Use pre-configured static token (most secure for long-lived tokens)
        context.log('Using static SLIP token from environment');
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            },
            body: JSON.stringify({
                token: staticToken,
                expires: null, // Static token doesn't expire
                ssl: false
            })
        };
        return;
    }

    // Fall back to dynamic token generation
    const username = process.env.SLIP_USERNAME;
    const password = process.env.SLIP_PASSWORD;

    if (!username || !password) {
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Server configuration error: Missing SLIP credentials or static token'
            })
        };
        return;
    }

    const tokenEndpoint = 'https://token.slip.wa.gov.au/arcgis/tokens/generateToken';
    const serverRoot = 'https://token.slip.wa.gov.au';

    try {
        // Build form data for token request
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        formData.append('referer', serverRoot);
        formData.append('f', 'json');
        formData.append('expiration', '60'); // Token valid for 60 minutes

        // Request token from SLIP
        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        const data = await response.json();

        if (data.error) {
            context.log.error('SLIP token error:', data.error);
            context.res = {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Authentication failed',
                    details: data.error
                })
            };
            return;
        }

        if (!data.token) {
            context.log.error('No token in response:', data);
            context.res = {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Token generation failed'
                })
            };
            return;
        }

        context.log('Token generated successfully');

        // Return token to client
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            },
            body: JSON.stringify({
                token: data.token,
                expires: data.expires,
                ssl: data.ssl || false
            })
        };

    } catch (error) {
        context.log.error('Error generating SLIP token:', error);
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to generate token',
                message: error.message
            })
        };
    }
};
