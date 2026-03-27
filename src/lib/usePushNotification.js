"use client";
import { useState, useEffect, useCallback } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function usePushNotification(userId) {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const supported = 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
        setIsSupported(supported);

        if (supported && userId) {
            navigator.serviceWorker.ready.then((reg) => {
                reg.pushManager.getSubscription().then((sub) => {
                    setIsSubscribed(!!sub);
                });
            });
        }
    }, [userId]);

    const subscribe = useCallback(async () => {
        if (!userId || !isSupported) return false;
        setIsLoading(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setIsLoading(false);
                return false;
            }

            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });

            // Save to server
            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, subscription: subscription.toJSON() }),
            });

            if (res.ok) {
                setIsSubscribed(true);
                return true;
            }
            return false;
        } catch (err) {
            console.error('[Push] Subscribe failed:', err);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [userId, isSupported]);

    const unsubscribe = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
            }

            await fetch('/api/push/subscribe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });

            setIsSubscribed(false);
        } catch (err) {
            console.error('[Push] Unsubscribe failed:', err);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    return { isSubscribed, isSupported, isLoading, subscribe, unsubscribe };
}
