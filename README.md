# trmnl-oauth-proxy

Disclaimer: code mostly written with assist from Cursor.com. I tried to steer it to something I
won't completely dislike, but... It works.

## Back story

The http://usetrmnl.com/ device is cool idea to display rarely updated data to an e-Ink display.

They also have very trivial way to create private plugins that show data from arbitrary source,
as long, as their server can fetch it over simple request -- which makes it perfect to display
varied information in a way you want -- simply editing an template to display.

Although, many data sources want little more complicate auth than just static key, and OAuth2
is one of the most frequent ways.

The service right now doesn't provide native way to request data with OAuth2 auth from external
sources. But even if it would, it raises the question of security: do you want to share the
secrets with the 3rd party directly?

This project is the middle ground between sharing private information (i.e. sharing auth tokens
etc) with the service and convenience to be able to fetch and edit the plugin in single place.

## Description

This project provides cost-effective way to store and manage your OAuth2 tokens without need
for having to pay for own service.

By installing this service onto your Cloudflare, you get ability to sign simple requests from
TRMNL (or any other simple requesting source) to the datasources you authorize, without exposing
auth token to the external service.

The tokens and auth is stored in your Cloudflare account in KV storage, this app keeps them
up to date so they are available to make requsts as required.

Each datasource added can be restricted to only APIs you want to allow, and you can add and
regenerate simple extra auth token required to make requests at any time to prevent misuse.

## Installation

Run:

```bash
npx wrangler kv namespace create TRMNL_OAUTH_PROXY
```

Copy `wrangler.toml.example` to `wrangler.toml` and replace "id" in `[[kv_namespaces]]` with
id of namespace you just created.

Create your username and password:

```
npx wrangler kv key put --binding=AUTH_KV --remote "username" "admin"
```

The password will be set on your first log in to the admin interface.

Now, deploy the worker:

```
npx wrangler deploy
```

You will get your personal site address, go to admin/ here:

- https://trmnl-oauth-proxy.yourname.workers.dev/admin/

And log in with username and password you configured here.

## Usage for some known sources

### How to set up proxy for Fitbit data access

1. Go to https://dev.fitbit.com/apps and use "Register a new app" button.

   - select "Personal" as OAuth 2.0 application type
   - put to "Redirect URL" the URL from your application, it shown at admin page
     (`https://trmnl-oauth-proxy.yourname.workers.dev/oauth/callback`)

2. Go to your admin app and fill form:

   - Application Name: something like `fitbit`
   - Client ID: Use the "OAuth 2.0 Client ID" of created application
   - OAuth Authorize Path: `https://www.fitbit.com/oauth2/authorize`
   - API Path: `https://api.fitbit.com/`
   - OAuth Scopes (space-separated): `activity` (see full list of [available scopes])

   You could authorize only ones you need now, if you'll need more later -- you'll
   add them later.

   Click `Add Application`

3. Now in the `fitbit` application card below click the "Authorize" button.

4. You can now fetch from TRMNL or any other place. You'll need to use path to your app and the token stored near
   'Regenerate' button:

   - `https://trmnl-oauth-proxy.yourname.workers.dev/get/fitbit/{PATH}?proxyToken={token}`
  
   For example, to get your steps, you could just go to
  
   - `https://trmnl-oauth-proxy.yourname.workers.dev/get/fitbit/1/user/-/activities/steps/date/today/1d/1min.json?proxyToken={token}`


[available scopes]: https://dev.fitbit.com/build/reference/web-api/developer-guide/application-design/#Scopes
