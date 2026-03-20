#pragma once
#include <string>
#include <fstream>
#include <cctype>

inline int ReadIntFromConfig(const std::string& path, const std::string& key, int defaultVal) {
    std::ifstream f(path);
    if (!f.is_open()) return defaultVal;
    std::string content((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    std::string search = "\"" + key + "\"";
    auto pos = content.find(search);
    if (pos == std::string::npos) return defaultVal;
    auto colon = content.find(':', pos + search.size());
    if (colon == std::string::npos) return defaultVal;
    auto numStart = content.find_first_not_of(" \t\r\n", colon + 1);
    if (numStart == std::string::npos) return defaultVal;
    if (!std::isdigit((unsigned char)content[numStart]) && content[numStart] != '-')
        return defaultVal;
    try { return std::stoi(content.c_str() + numStart); }
    catch (...) { return defaultVal; }
}
