// www.namax.at contact form (js/contact.js): POST { ev, page } → a counted step; { role, wish, name, phone, channel, text } → a request in the admin list.
import { handleContact } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const POST = (request) => handleContact(request, services());
