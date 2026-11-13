import React, { useState } from "react";
import "./style.css";
import { VscGrabber, VscClose } from "react-icons/vsc";
import { Link } from "react-router-dom";
import { logotext ,socialprofils } from "../content_option";
import Themetoggle from "../components/themetoggle";

const Headermain = () => {
  const [isActive, setActive] = useState("false");

  const handleToggle = () => {
    setActive(!isActive);
    document.body.classList.toggle("ovhidden");
  };

  return (
    <>
      <header className="fixed-top site__header">
        <div className="d-flex align-items-center justify-content-between">
          <Link  className="navbar-brand nav_ac" to="/">
            {logotext}
          </Link>
          <div className="d-flex align-items-center">
          <Themetoggle />
          <button className="menu__button  nav_ac" onClick={handleToggle}>
            {!isActive ? <VscClose /> : <VscGrabber />}
          </button>
          
          </div>
        </div>

        <div className={`site__navigation ${!isActive ? "menu__opend" : ""}`}>
          <div className="bg__menu">
            <div className="menu__wrapper">
              <div className="menu__container">
                <ul className="the_menu">
                  <li className="menu_item">
                    <Link onClick={handleToggle} to="/">Home</Link>
                  </li>
                  <li className="menu_item">
                    <Link onClick={handleToggle} to="/blog">Tech Blog</Link>
                  </li>
                  <li className="menu_item">
                    <Link onClick={handleToggle} to="/hamradio">HAM Blog</Link>
                  </li>
                  <li className="menu_item">
                    <Link onClick={handleToggle} to="/resources">Resources</Link>
                  </li>
                  <li className="menu_item">
                    <Link onClick={handleToggle} to="/about">About</Link>
                  </li>
                </ul>
              </div>
            </div>
            <div className="menu_footer">
              <div className="d-flex">
                <a href={socialprofils.facebook}>Facebook</a>
                <a href={socialprofils.github}>Github</a>
                <a href={socialprofils.twitter}>Twitter</a>
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};

export default Headermain;
