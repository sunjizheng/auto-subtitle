#ifndef BASE64_H
#define BASE64_H

unsigned int b64_encoded_size(unsigned int inlen);

unsigned int b64_encode(const unsigned char *in, unsigned int len, char *out);

#endif /* BASE64_H */