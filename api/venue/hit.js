// Page view counter: always 204.
import { handleHit } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const POST = (request) => handleHit(request, services());
