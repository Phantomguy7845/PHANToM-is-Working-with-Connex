const Store = require('electron-store');
const store = new Store({
  name: 'bridge_state',
  defaults: {
    port: 8765,
    selectedSerial: "",
    lastWiFiHost: ""
  }
});
module.exports = store;
