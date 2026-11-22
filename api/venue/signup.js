// namax.at/kostenlos: POST { slug | lokal, role, wish, name, phone, channel, website } → a request in the admin list.
import { handleSignup } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const POST = (request) => handleSignup(request, services());
