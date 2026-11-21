// Owner request form: POST { role, wish, name, phone, channel, text, website } on <slug>.namax.at/api/venue/claim.
import { handleClaim } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const POST = (request) => handleClaim(request, services());
