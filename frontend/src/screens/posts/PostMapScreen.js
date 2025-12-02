import { Platform } from 'react-native';

const PostMapScreen = Platform.OS === 'web'
  ? require('./PostMapScreen.web').default
  : require('./PostMapScreen.native').default;

export default PostMapScreen;
