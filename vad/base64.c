/* This is a public domain base64 implementation written by WEI Zhicheng. */

#include "base64.h"

const char b64chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

unsigned int b64_encoded_size(unsigned int inlen)
{
	unsigned int ret;

	ret = inlen;
	if (inlen % 3 != 0) 
		ret += 3 - (inlen % 3);
	ret /= 3;
	ret *= 4;

	return ret;
}

unsigned int b64_encode(const unsigned char *in, unsigned int len, char *out)
{
	unsigned int  i;
	unsigned int  j;
	unsigned int  v;

	if (in == 0 || len == 0)
		return 0;

	for (i=0, j=0; i<len; i+=3, j+=4) {
		v = in[i];
		v = i+1 < len ? v << 8 | in[i+1] : v << 8;
		v = i+2 < len ? v << 8 | in[i+2] : v << 8;

		out[j]   = b64chars[(v >> 18) & 0x3F];
		out[j+1] = b64chars[(v >> 12) & 0x3F];
		if (i+1 < len) {
			out[j+2] = b64chars[(v >> 6) & 0x3F];
		} else {
			out[j+2] = '=';
		}
		if (i+2 < len) {
			out[j+3] = b64chars[v & 0x3F];
		} else {
			out[j+3] = '=';
		}
	}

	return b64_encoded_size(len);
}
