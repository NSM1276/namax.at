// <slug>.namax.at/* is rewritten here by middleware.js. The slug comes from the Host header.
import { handlePage } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const GET = (request) => handlePage(request, services());
