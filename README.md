# trmnl-oauth-proxy

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

## Set up of datasource

## Usage of datasource

## TODO

1. Install cursor
2. Vibe code

