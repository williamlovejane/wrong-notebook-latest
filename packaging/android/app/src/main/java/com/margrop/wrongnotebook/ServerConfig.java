package com.margrop.wrongnotebook;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

/** 保存用户填写的服务器地址，并提供地址规范化与同源判断 */
final class ServerConfig {
    private static final String PREFS = "server";
    private static final String KEY_URL = "url";

    private ServerConfig() {
    }

    static String get(Context context) {
        return prefs(context).getString(KEY_URL, null);
    }

    static void set(Context context, String url) {
        prefs(context).edit().putString(KEY_URL, url).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * 规范化用户输入：缺省补 http://，只保留协议、主机、端口和路径，去掉末尾斜杠。
     * 地址无效时返回 null。
     */
    static String normalize(String input) {
        if (input == null) return null;
        String value = input.trim();
        if (value.isEmpty()) return null;
        if (!value.matches("(?i)^[a-z][a-z0-9+.-]*://.*")) value = "http://" + value;

        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!scheme.equals("http") && !scheme.equals("https")) return null;
        String host = uri.getHost();
        if (host == null || host.isEmpty()) return null;

        String path = uri.getEncodedPath() == null ? "" : uri.getEncodedPath();
        String result = scheme + "://" + uri.getEncodedAuthority() + path;
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }

    /** 判断链接是否与服务器同源（协议、主机、端口一致） */
    static boolean isSameOrigin(Uri url, String serverUrl) {
        if (url == null || serverUrl == null) return false;
        Uri server = Uri.parse(serverUrl);
        return equalsIgnoreCase(url.getScheme(), server.getScheme())
                && equalsIgnoreCase(url.getHost(), server.getHost())
                && port(url) == port(server);
    }

    private static boolean equalsIgnoreCase(String a, String b) {
        return a != null && a.equalsIgnoreCase(b);
    }

    private static int port(Uri uri) {
        if (uri.getPort() != -1) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }
}
