package com.faceattendance.app
import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.location.LocationManager
import android.location.Location
import android.provider.Settings
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import java.security.MessageDigest
import java.util.UUID
class MainActivity: AppCompatActivity() {
 private lateinit var web: WebView
 private fun unsafe():Boolean {
  val devOptions=try { Settings.Global.getInt(contentResolver,Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,0)==1 }catch(_:Exception){false}
  val legacyMock=try { android.os.Build.VERSION.SDK_INT<23 && Settings.Secure.getString(contentResolver,"mock_location")=="1" }catch(_:Exception){false}
  return devOptions || legacyMock || hasMockedLastLocation()
 }
 @Suppress("DEPRECATION")
 private fun hasMockedLastLocation():Boolean {
  return try {
   if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED && ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) false
   else {
    val lm=getSystemService(LOCATION_SERVICE) as LocationManager
    lm.allProviders.any { provider -> try {
     val loc:Location?=lm.getLastKnownLocation(provider)
     loc!=null && if(android.os.Build.VERSION.SDK_INT>=31) loc.isMock else loc.isFromMockProvider
    }catch(_:SecurityException){false} }
   }
  }catch(_:Exception){false}
 }
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);if(unsafe()){Toast.makeText(this,"Disable Developer Options/mock location to continue",Toast.LENGTH_LONG).show();finish();return}
  val need=arrayOf(Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO,Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION).filter{ContextCompat.checkSelfPermission(this,it)!=PackageManager.PERMISSION_GRANTED};if(need.isNotEmpty())ActivityCompat.requestPermissions(this,need.toTypedArray(),1)
  web=WebView(this);setContentView(web);web.settings.javaScriptEnabled=true;web.settings.domStorageEnabled=true;web.settings.mediaPlaybackRequiresUserGesture=false;web.settings.setGeolocationEnabled(true);web.webViewClient=WebViewClient();web.webChromeClient=object:WebChromeClient(){override fun onPermissionRequest(r:PermissionRequest){runOnUiThread{val ok=r.resources.all{(it==PermissionRequest.RESOURCE_VIDEO_CAPTURE&&ContextCompat.checkSelfPermission(this@MainActivity,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)||(it==PermissionRequest.RESOURCE_AUDIO_CAPTURE&&ContextCompat.checkSelfPermission(this@MainActivity,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)};if(ok)r.grant(r.resources)else r.deny()}};override fun onGeolocationPermissionsShowPrompt(o:String,c:GeolocationPermissions.Callback){val ok=ContextCompat.checkSelfPermission(this@MainActivity,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||ContextCompat.checkSelfPermission(this@MainActivity,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;c.invoke(o,ok&&!hasMockedLastLocation(),false)}}
  val url=getString(com.faceattendance.app.R.string.web_app_url);if(url.startsWith("https://")&&!url.contains("YOUR_WEB_APP_HOST"))web.loadUrl(url)else{Toast.makeText(this,"Set HTTPS web_app_url in config.xml",Toast.LENGTH_LONG).show();finish()};requestIntegrity()
 }
 private fun requestIntegrity(){val p=getString(R.string.play_integrity_cloud_project_number).toLongOrNull()?:return;if(p<=0)return;val nonce=MessageDigest.getInstance("SHA-256").digest((UUID.randomUUID().toString()+System.currentTimeMillis()).toByteArray()).joinToString(""){"%02x".format(it)};IntegrityManagerFactory.create(applicationContext).requestIntegrityToken(IntegrityTokenRequest.builder().setCloudProjectNumber(p).setNonce(nonce).build()).addOnSuccessListener{getSharedPreferences("integrity",0).edit().putString("token",it.token()).apply()}.addOnFailureListener{Toast.makeText(this,"Device integrity unavailable",Toast.LENGTH_LONG).show()}}
 override fun onResume(){super.onResume();if(::web.isInitialized&&unsafe()){Toast.makeText(this,"Device security settings changed",Toast.LENGTH_LONG).show();finish()}}
 override fun onBackPressed(){if(::web.isInitialized&&web.canGoBack())web.goBack()else super.onBackPressed()}
}
