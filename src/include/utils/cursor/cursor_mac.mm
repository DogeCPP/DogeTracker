#if APL
#import <Cocoa/Cocoa.h>
#include "cursor.h"

extern "C" void initializeCursor() {}

extern "C" void destroyCursor() {}

extern "C" void setCursor(CursorType cursor) {
    switch (cursor) {
        case CursorHand:
            @autoreleasepool {
                [[NSCursor pointingHandCursor] set];
            }
            break;
            
        case CursorText:
            @autoreleasepool {
                [[NSCursor IBeamCursor] set];
            }
            break;
            
        default:
            break;
    }
}

#endif
