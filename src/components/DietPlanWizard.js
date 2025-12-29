"use client";
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

export default function DietPlanWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    gender: 'female',
    age: '',
    height: '',
    currentWeight: '',
    targetWeight: '',
    activityLevel: 'moderate'
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else calculateAndFinish();
  };

  const calculateAndFinish = () => {
    // Simple BMR Calculation (Mifflin-St Jeor Equation)
    const { gender, age, height, currentWeight, activityLevel } = formData;
    const w = parseFloat(currentWeight);
    const h = parseFloat(height);
    const a = parseFloat(age);

    let bmr = 10 * w + 6.25 * h - 5 * a;
    bmr += gender === 'male' ? 5 : -161;

    // Activity Multipliers
    const multipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };

    const tdee = bmr * (multipliers[activityLevel] || 1.2);
    const targetCalories = Math.round(tdee - 500); // Deficit for weight loss

    // Save to LocalStorage
    const userProfile = {
      ...formData,
      bmr,
      tdee,
      targetCalories,
      createdAt: new Date().toISOString()
    };

    onComplete(userProfile);
  };

  return (
    <div className="wizard-container glass-panel fade-in" style={{ padding: '40px', maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
      <div style={{ marginBottom: '30px' }}>
        <h2 className="title-gradient" style={{ fontSize: '1.8rem', margin: '0 0 10px 0' }}>目標設定</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Step {step} / 3</p>
        <div style={{ height: '4px', background: 'var(--border-subtle)', borderRadius: '2px', marginTop: '10px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(step / 3) * 100}%`, background: 'var(--primary)', transition: 'width 0.3s ease' }}></div>
        </div>
      </div>

      {step === 1 && (
        <div className="step-content fade-in">
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>性別</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setFormData({ ...formData, gender: 'male' })}
                className={formData.gender === 'male' ? 'btn-primary' : 'glass-panel'}
                style={{ flex: 1, padding: '12px', border: formData.gender === 'male' ? 'none' : '1px solid var(--border-subtle)' }}
              >
                男性
              </button>
              <button
                onClick={() => setFormData({ ...formData, gender: 'female' })}
                className={formData.gender === 'female' ? 'btn-primary' : 'glass-panel'}
                style={{ flex: 1, padding: '12px', border: formData.gender === 'female' ? 'none' : '1px solid var(--border-subtle)' }}
              >
                女性
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>年齢</label>
            <input
              type="number"
              name="age"
              value={formData.age}
              onChange={handleChange}
              placeholder="例: 30"
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="step-content fade-in">
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1, marginBottom: '20px' }}>
              <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>身長 (cm)</label>
              <input
                type="number"
                name="height"
                value={formData.height}
                onChange={handleChange}
                placeholder="170"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1, marginBottom: '20px' }}>
              <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>体重 (kg)</label>
              <input
                type="number"
                name="currentWeight"
                value={formData.currentWeight}
                onChange={handleChange}
                placeholder="60"
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="step-content fade-in">
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>目標体重 (kg)</label>
            <input
              type="number"
              name="targetWeight"
              value={formData.targetWeight}
              onChange={handleChange}
              placeholder="55"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>活動レベル</label>
            <select name="activityLevel" value={formData.activityLevel} onChange={handleChange} style={inputStyle}>
              <option value="sedentary">デスクワーク (運動なし)</option>
              <option value="light">軽い運動 (週1-2回)</option>
              <option value="moderate">中程度の運動 (週3-5回)</option>
              <option value="active">活発な運動 (ほぼ毎日)</option>
            </select>
          </div>
        </div>
      )}

      <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {step > 1 ? (
          <button onClick={() => setStep(step - 1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem' }}>戻る</button>
        ) : <div></div>}

        <button className="btn-primary" onClick={handleNext} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {step === 3 ? 'プランを作成' : '次へ'} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  background: '#FFFFFF',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '1rem',
  outline: 'none',
  transition: 'border-color 0.2s'
};
