// A zone with daylight saving time, so date code that slips into local time fails here as it would on such a server.
module.exports = () => {
  process.env.TZ = 'Europe/Lisbon';
};
