"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../firebase/config";
import {
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged,
    signOut
} from "firebase/auth";

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const googleSignIn = () => {
        const provider = new GoogleAuthProvider();
        return signInWithPopup(auth, provider);
    };

    const logOut = () => {
        return signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, googleSignIn, logOut, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
