// src/auth/index.js
import {router} from '../../router/index'
import ROUTER from '../../router'
import {Howl} from 'howler'
import Vue from 'vue'
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import Config from '../../config.js'
export default {
  user: {
    userID: 0,
    username: '',
    email: null,
    type: null,
    status: null,
    profile: null,
    amount: null,
    notifications: {
      data: null,
      current: null,
      prevCurrent: null
    },
    notifSetting: null,
    messages: {
      data: null,
      totalUnreadMessages: 0
    }
  },
  messenger: {
    messages: null,
    badge: 0,
    messengerGroupId: null
  },
  support: {
    messages: null,
    badge: 0,
    messengerGroupId: null
  },
  notifTimer: {
    timer: null,
    speed: 1000
  },
  tokenData: {
    token: null,
    tokenTimer: false,
    verifyingToken: false
  },
  otpDataHolder: {
    userInfo: null,
    data: null
  },
  google: {
    code: null,
    scope: null
  },
  echo: null,
  currentPath: false,
  setUser(userID, username, email, type, status, profile, notifSetting){
    if(userID === null){
      username = null
      email = null
      type = null
      status = null
      profile = null
      notifSetting = null
    }
    this.user.userID = userID * 1
    this.user.username = username
    this.user.email = email
    this.user.type = type
    this.user.status = status
    this.user.profile = profile
    this.user.notifSetting = notifSetting
    localStorage.setItem('account_id', this.user.userID)
  },
  setToken(token){
    this.tokenData.token = token
    localStorage.setItem('usertoken', token)
    if(token){
      setTimeout(() => {
        let vue = new Vue()
        vue.APIRequest('authenticate/refresh', {}, (response) => {
          this.setToken(response['token'])
        }, (response) => {
          this.deaunthenticate()
        })
      }, 1000 * 60 * 60) // 50min
    }
  },
  authenticate(username, password, callback, errorCallback){
    let vue = new Vue()
    let credentials = {
      username: username,
      password: password,
      status: 'VERIFIED'
    }
    vue.APIRequest('authenticate', credentials, (response) => {
      this.setToken(response.token)
      vue.APIRequest('authenticate/user', {}, (userInfo) => {
        let parameter = {
          'condition': [{
            'value': userInfo.id,
            'clause': '=',
            'column': 'id'
          }]
        }
        vue.APIRequest('accounts/retrieve', parameter).then(response => {
          if(response.data.length > 0){
            this.otpDataHolder.userInfo = userInfo
            this.otpDataHolder.data = response.data
            this.checkOtp(response.data[0].notification_settings)
          }
        })
        // this.retrieveNotifications(userInfo.id)
        this.retrieveMessages(userInfo.id, userInfo.account_type)
        this.connect()
        if(callback){
          callback(userInfo)
        }
      })
    }, (response, status) => {
      if(errorCallback){
        errorCallback(response, status)
      }
    })
  },
  checkAuthentication(callback){
    this.tokenData.verifyingToken = true
    let token = localStorage.getItem('usertoken')
    if(token){
      this.setToken(token)
      let vue = new Vue()
      vue.APIRequest('authenticate/user', {}, (userInfo) => {
        let parameter = {
          'condition': [{
            'value': userInfo.id,
            'clause': '=',
            'column': 'id'
          }]
        }
        vue.APIRequest('accounts/retrieve', parameter).then(response => {
          let profile = response.data[0].account_profile
          let notifSetting = response.data[0].notification_settings
          this.setUser(userInfo.id, userInfo.username, userInfo.email, userInfo.account_type, userInfo.status, profile, notifSetting)
        }).done(response => {
          this.tokenData.verifyingToken = false
          let location = window.location.href
          this.connect()
          if(this.currentPath){
            // ROUTER.push(this.currentPath)
          }else{
            window.location.href = location
          }
        })
        // this.retrieveNotifications(userInfo.id)
        this.retrieveMessages(userInfo.id, userInfo.account_type)
        this.getGoogleCode()
      }, (response) => {
        this.setToken(null)
        this.tokenData.verifyingToken = false
        ROUTER.push({
          path: this.currentPath
        })
      })
      return true
    }else{
      this.tokenData.verifyingToken = false
      this.setUser(null)
      return false
    }

  },
  deaunthenticate(){
    localStorage.removeItem('usertoken')
    localStorage.removeItem('account_id')
    localStorage.removeItem('google_code')
    localStorage.removeItem('google_scope')
    this.setUser(null)
    let vue = new Vue()
    vue.APIRequest('authenticate/invalidate')
    this.clearNotifTimer()
    this.tokenData.token = null
    ROUTER.go('/')
  },
  retrieveNotifications(accountId){
    let vue = new Vue()
    let parameter = {
      'account_id': accountId
    }
    vue.APIRequest('notifications/retrieve', parameter).then(response => {
      if(response.data.length > 0){
        this.user.notifications.data = response.data
        this.user.notifications.current = response.notification_current
        if(this.user.notifications.current > 0){
          // this.playNotificationSound()
        }
      }else{
        this.user.notifications.data = null
        this.user.notifications.current = null
      }
    })
  },
  retrieveMessages(accountId, type){
    let vue = new Vue()
    let parameter = {
      account_id: accountId,
      account_type: type
    }
    vue.APIRequest('messenger_groups/retrieve_summary', parameter).then(response => {
      this.user.messages.data = response.data
      this.user.messages.totalUnreadMessages = response.total_unread_messages
    })
  },
  startNotifTimer(accountId){
    if(this.notifTimer.timer === null){
      this.notifTimer.timer = window.setInterval(() => {
        if(accountId !== null){
          this.retrieveNotifications(accountId)
        }
      }, this.notifTimer.speed)
    }
  },
  clearNotifTimer(){
    if(this.notifTimer.timer !== null){
      window.clearInterval(this.notifTimer.timer)
      this.notifTimer.timer = null
    }
  },
  playNotificationSound(){
    let audio = require('../../assets/audio/notification.mp3')
    let sound = new Howl({
      src: [audio]
    })
    sound.play()
  },
  checkPlan(){
    if(this.user.plan !== null){
      if(this.user.plan.title === 'Expired' && this.user.type !== 'ADMIN'){
        ROUTER.push('/plan')
      }
    }
  },
  redirect(path){
    ROUTER.push(path)
  },
  validateEmail(email){
    let reg = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+.[a-zA-Z0-9]*$/
    if(reg.test(email) === false){
      return false
    }else{
      return true
    }
  },
  checkOtp(setting){
    if(setting !== null){
      if(parseInt(setting.email_otp) === 1 || parseInt(setting.sms_otp) === 1){
        // ask otp code here
        $('#otpModal').modal({
          backdrop: 'static',
          keyboard: true,
          show: true
        })
      }else{
        this.proceedToLogin()
      }
    }else{
      this.proceedToLogin()
    }
  },
  proceedToLogin(){
    let userInfo = this.otpDataHolder.userInfo
    let data = this.otpDataHolder.data
    let profile = data[0].account_profile
    let notifSetting = data[0].notification_settings
    this.setUser(userInfo.id, userInfo.username, userInfo.email, userInfo.account_type, userInfo.status, profile, notifSetting)
    ROUTER.push('/dashboard')
  },
  setGoogleCode(code, scope){
    localStorage.setItem('google_code', code)
    localStorage.setItem('google_scope', scope)
    this.google.code = code
    this.google.scope = scope
  },
  getGoogleCode(){
    this.google.code = localStorage.getItem('google_code')
    this.google.scope = localStorage.getItem('google_scope')
  },
  connect(){
    if(!this.echo){
      this.echo = new Echo({
        broadcaster: 'pusher',
        key: Config.PUSHER_KEY,
        cluster: 'ap1',
        encrypted: true,
        auth: {
          headers: {
            Authorization: 'Bearer' + this.tokenData.token
          }
        }
      })
      $.ajaxSetup({
        beforeSend: function() {}
      })
    }
    this.echo.channel('idfactory').listen('Message', (response) => {
      if(parseInt(response.message.account_id) !== this.user.userID && response.message.type === 'support'){
        this.playNotificationSound()
        if(this.support.messengerGroupId !== parseInt(response.message.messenger_group_id) && this.support.messengerGroupId !== null){
          this.support.badge++
        }
        if(!this.support.messages){
          this.support.messages = []
          this.support.messages.push(response.message)
        }else{
          if(this.support.messengerGroupId === parseInt(response.message.messenger_group_id)){
            this.support.messages.push(response.message)
          }
        }
      }else if(parseInt(response.message.account_id) !== this.user.userID && response.message.type !== 'support'){
        this.playNotificationSound()
        if(this.messenger.messengerGroupId !== parseInt(response.message.messenger_group_id) && this.messenger.messengerGroupId !== null){
          this.messenger.badge++
        }
        if(!this.messenger.messages){
          this.messenger.messages = []
          this.messenger.messages.push(response.message)
        }else{
          if(this.messenger.messengerGroupId === parseInt(response.message.messenger_group_id)){
            this.messenger.messages.push(response.message)
          }
        }
      }
    })
  },
  displayAmount(amount){
    // amount.toString().replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '1,')
    // console.log(amount)
    var formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PHP'
    })
    return formatter.format(amount)
  }
}
