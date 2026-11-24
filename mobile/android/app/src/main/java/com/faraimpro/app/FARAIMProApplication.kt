package com.faraimpro.app

import android.app.Application
import com.faraimpro.app.data.DataRepository

class FARAIMProApplication : Application() {
    val repository: DataRepository by lazy { DataRepository(applicationContext) }
}
