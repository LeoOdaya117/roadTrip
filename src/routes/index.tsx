import React from 'react';
import { Redirect, Route } from 'react-router-dom';
import Tab1 from '../features/home/Tab1';
import Tab2 from '../features/home/Tab2';
import Tab3 from '../features/home/Tab3';
import Login from '../features/auth/Login';
import Signup from '../features/auth/Signup';
import { useAuth } from '../shared/auth/AuthProvider';

export default function AppRoutes() {
  const auth = useAuth();
  const isAuth = !!auth?.token;

  return (
    <>
      <Route exact path="/tab1" render={() => (isAuth ? <Tab1 /> : <Redirect to="/login" />)} />
      <Route exact path="/tab2" render={() => (isAuth ? <Tab2 /> : <Redirect to="/login" />)} />
      <Route path="/tab3" render={() => (isAuth ? <Tab3 /> : <Redirect to="/login" />)} />
      <Route exact path="/login">
        <Login />
      </Route>
      <Route exact path="/signup">
        <Signup />
      </Route>
      <Route exact path="/">
        {isAuth ? <Redirect to="/tab1" /> : <Redirect to="/login" />}
      </Route>
    </>
  );
}
