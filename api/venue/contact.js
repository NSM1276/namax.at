// Request form of Nasim's sites (js/contact.js on namax.at, akiwi.at, fightfolio.de): POST { ev, page } → a counted step;
// { role, wish, name, phone, channel, text, topic } → a request in the admin list. OPTIONS: may the other sites send here.
import { handleContact } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const POST = (request) => handleContact(request, services());
export const OPTIONS = (request) => handleContact(request, services());
