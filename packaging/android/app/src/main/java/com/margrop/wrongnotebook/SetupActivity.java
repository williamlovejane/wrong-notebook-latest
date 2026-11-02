package com.margrop.wrongnotebook;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 首次启动或更换服务器时填写服务器地址，通过 /api/health 确认是错题本服务端 */
public class SetupActivity extends Activity {
    private static final int TIMEOUT_MS = 8000;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private EditText urlInput;
    private Button connectButton;
    private ProgressBar progress;
    private TextView status;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_setup);
        SystemBars.applyInsets(findViewById(R.id.root));

        urlInput = findViewById(R.id.server_url);
        connectButton = findViewById(R.id.connect);
        progress = findViewById(R.id.progress);
        status = findViewById(R.id.status);

        String current = ServerConfig.get(this);
        if (current != null) urlInput.setText(current);

        connectButton.setOnClickListener(v -> connect());
        urlInput.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) {
                connect();
                return true;
            }
            return false;
        });
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private void connect() {
        String url = ServerConfig.normalize(urlInput.getText().toString());
        if (url == null) {
            status.setText(R.string.setup_invalid_url);
            return;
        }
        urlInput.setText(url);
        setBusy(true);
        executor.execute(() -> {
            String error = checkServer(url);
            mainHandler.post(() -> {
                if (isFinishing() || isDestroyed()) return;
                setBusy(false);
                if (error == null) {
                    save(url);
                } else {
                    confirmUnverified(url, error);
                }
            });
        });
    }

    private void setBusy(boolean busy) {
        connectButton.setEnabled(!busy);
        urlInput.setEnabled(!busy);
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        status.setText(busy ? getString(R.string.setup_checking) : "");
    }

    /** 返回 null 表示服务器可用，否则返回错误说明 */
    private String checkServer(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url + "/api/health").openConnection();
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            int code = connection.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) return "HTTP " + code;
            String body = readLimited(connection.getInputStream());
            if (!body.contains("\"status\"")) return getString(R.string.setup_not_wrong_notebook);
            return null;
        } catch (IOException e) {
            String message = e.getMessage();
            return e.getClass().getSimpleName() + (message == null ? "" : ": " + message);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readLimited(InputStream input) throws IOException {
        try (InputStream in = input) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int read;
            while (out.size() < 4096 && (read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    /** 自签名证书、健康检查被代理拦截等情况下，允许用户确认后仍使用该地址 */
    private void confirmUnverified(String url, String error) {
        new AlertDialog.Builder(this)
                .setTitle(R.string.setup_check_failed_title)
                .setMessage(getString(R.string.setup_check_failed_message, error))
                .setPositiveButton(R.string.setup_use_anyway, (dialog, which) -> save(url))
                .setNegativeButton(R.string.cancel, null)
                .show();
    }

    private void save(String url) {
        ServerConfig.set(this, url);
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }
}
