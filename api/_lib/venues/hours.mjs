// Opening-hours logic. hours = 7 entries, index 0 = Sunday, each null (closed) or
// [open, close] in minutes; close <= open means the venue closes after midnight.
// These functions are inlined into the page with fn.toString(): keep them free of
// imports and of references to anything outside their own body.

export function openState(hours, day, minute) {
  var none = { open: false, until: null, opensAt: null };
  if (!hours || hours.length !== 7) return none;
  var today = hours[day];
  var yesterday = hours[(day + 6) % 7];
  if (yesterday && yesterday[1] <= yesterday[0] && minute < yesterday[1]) {
    return { open: true, until: yesterday[1], opensAt: null };
  }
  if (today) {
    var overnight = today[1] <= today[0];
    if (minute >= today[0] && (overnight || minute < today[1])) {
      return { open: true, until: today[1], opensAt: null };
    }
    if (minute < today[0]) return { open: false, until: null, opensAt: { day: day, minute: today[0] } };
  }
  for (var i = 1; i <= 7; i++) {
    var d = (day + i) % 7;
    if (hours[d]) {
      var next = { day: d, minute: hours[d][0] };
      if (i === 7) next.nextWeek = true; // same weekday, a week from now
      return { open: false, until: null, opensAt: next };
    }
  }
  return none;
}

export function formatMinute(minute) {
  var m = ((minute % 1440) + 1440) % 1440;
  var h = Math.floor(m / 60);
  var r = m % 60;
  return (h < 10 ? '0' : '') + h + ':' + (r < 10 ? '0' : '') + r;
}

export function viennaNow(date) {
  var parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Vienna', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  var get = function (type) {
    for (var i = 0; i < parts.length; i++) if (parts[i].type === type) return parts[i].value;
    return '';
  };
  var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day: day, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}
