#ifndef DRAWING_H
#define DRAWING_H

#include <XPLMGraphics.h>
#include <vector>
#include <string>
#include <array>

class Drawing {
private:
    static float AbsoluteX(float normalizedX);
    static float AbsoluteY(float normalizedY);
public:
    static void DrawLine(float x1, float y1, float x2, float y2, float thickness);
    static void DrawRect(float x1, float y1, float x2, float y2);
    static void DrawRoundedRect(float x1, float y1, float x2, float y2, float radius);
    static std::vector<std::string> SplitTextToWords(const std::string & text);
    static std::vector<std::string> WrapWordsToLines(XPLMFontID font, const std::string & text, float normalizedWidth);
    static float TextWidth(std::string text, float scale = 1.0f);
    static float DrawText(std::string text, float x, float y, float scale = 1.0f, std::array<float, 3> color = { 0.0f, 0.0f, 0.0f });
};

#endif
