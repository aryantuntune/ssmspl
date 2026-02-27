import { TextStyle } from 'react-native';

export const typography = {
  h1: { fontSize: 28, fontWeight: 'bold' as TextStyle['fontWeight'], lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: 'bold' as TextStyle['fontWeight'], lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as TextStyle['fontWeight'], lineHeight: 24 },
  body: { fontSize: 16, fontWeight: 'normal' as TextStyle['fontWeight'], lineHeight: 22 },
  bodySmall: { fontSize: 14, fontWeight: 'normal' as TextStyle['fontWeight'], lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: 'normal' as TextStyle['fontWeight'], lineHeight: 16 },
  button: { fontSize: 16, fontWeight: '600' as TextStyle['fontWeight'], lineHeight: 22 },
};
