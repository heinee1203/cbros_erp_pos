import './src/polyfills/crypto'; // Must be before uuid
import 'react-native-gesture-handler'; // Must be before navigation
import { AppRegistry } from 'react-native';
import App from './App';

AppRegistry.registerComponent('ApexPOS', () => App);
