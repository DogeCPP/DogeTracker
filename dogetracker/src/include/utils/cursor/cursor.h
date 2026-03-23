#ifndef CURSOR_H
#define CURSOR_H
enum CursorType: unsigned char {
    CursorDefault = 0,
    CursorHand,
    CursorText
};

#if APL
#ifdef __cplusplus
extern "C" {
#endif
#endif

void initializeCursor();
void setCursor(CursorType cursor);
void destroyCursor();

#if APL
#ifdef __cplusplus
}
#endif
#endif

#endif
