package com.fridgeboard.app;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.app.job.JobWorkItem;
import android.os.Build;
import androidx.annotation.RequiresApi;
import androidx.work.Data;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 固定启用的系统作业入口，避免任务启停触发包变更与 Launcher 重建。 */
@RequiresApi(Build.VERSION_CODES.O)
public final class RecipeWidgetJobService extends JobService {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile JobParameters active;

    @Override
    public boolean onStartJob(JobParameters params) {
        active = params;
        executor.execute(() -> {
            while (active == params) {
                JobWorkItem item = params.dequeueWork();
                if (item == null) return;
                byte[] bytes = item.getIntent().getByteArrayExtra("input");
                RecipeWidgetAndroidWorker.runWork(getApplicationContext(), Data.fromByteArray(bytes));
                if (active == params) params.completeWork(item);
            }
        });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        if (active == params) active = null;
        // 系统保留未确认的工作；期望状态校验使重投递可收敛。
        return true;
    }

    @Override
    public void onDestroy() {
        active = null;
        executor.shutdown();
        super.onDestroy();
    }
}
