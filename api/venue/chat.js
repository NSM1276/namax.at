// Owner chat: POST { k, input } on <slug>.namax.at/api/venue/chat.
import { handleChat } from '../_lib/venues/http.mjs';
import { services } from '../_lib/venues/services.mjs';

export const maxDuration = 30;
export const POST = (request) => handleChat(request, services());
