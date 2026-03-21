import React from 'react';
import { Redirect, Route } from 'react-router-dom';
import Tab1 from '../features/home/Tab1';
import Tab2 from '../features/home/Tab2';
import Tab3 from '../features/home/Tab3';
import Login from '../features/auth/Login';
import Signup from '../features/auth/Signup';

export default function AppRoutes() {
  return (
    <>
      <Route exact path="/tab1">
        <Tab1 />
      </Route>
      <Route exact path="/tab2">
        <Tab2 />
      </Route>
      <Route path="/tab3">
        <Tab3 />
      </Route>
      <Route exact path="/login">
        <Login />
      </Route>
      <Route exact path="/signup">
        <Signup />
      </Route>
      <Route exact path="/">
        <Redirect to="/tab1" />
      </Route>
    </>
  );
}
