import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const sdk = await ZAI.create();
const imageB64 = fs.readFileSync('/home/z/my-project/upload/ChatGPT Image Aug 17, 2026, 01_10_31 PM.png').toString('base64');

const res = await sdk.chat.completions.createVision({
  model: 'glm-4.5v',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'This is a mobile app screenshot of a "Pasang Iklan" (Post Ad) form. Describe the UI in great detail: 1) Header bar - what does it look like, what icons/text? 2) Form sections - list every visible field, label, placeholder, and input type. 3) Layout structure - is it single column? Card-based? What spacing? 4) Colors and styling - what colors are used for buttons, labels, backgrounds? 5) Any photo upload area - describe it. 6) The submit button - what text, color, position? 7) Any category/condition selectors - describe. Be very thorough and specific about every element visible.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + imageB64 } },
      ],
    },
  ],
});

console.log(res.choices[0].message.content);
