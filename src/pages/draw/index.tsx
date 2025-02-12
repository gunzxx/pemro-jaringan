"use client";

import { FC, useEffect, useState, useRef, FormEvent, ChangeEvent } from "react";
import { useDraw } from "@/hooks/useDraw";
import { TwitterPicker } from "react-color";
import {
  IoTrashBin,
  IoPencil,
  IoText,
  IoDocumentText,
  IoAddCircle,
  IoAdd,
} from "react-icons/io5";
import { getCookie, setCookie } from "cookies-next";

import { useSearchParams } from "next/navigation";
import { io } from "socket.io-client";
import { drawLine } from "@/utils/drawLine";
import { Socket } from "socket.io";
import { Prisma } from "@prisma/client";
import _ from "lodash";
import { BsCircle, BsSquare, BsTriangle } from "react-icons/bs";
let socket: Socket;

interface pageProps { }

type DrawLineProps = {
  prevPoint: Point | null;
  currentPoint: Point;
  color: string;
};

type FilewithUser = Prisma.FileGetPayload<{
  include: {
    user: true;
  };
}>;
export default function Home() {
  const searchParams = useSearchParams();
  const coockieSessionId = getCookie("sessionId");
  const coockieUserId = getCookie("userId");
  const coockieUsername = getCookie("username");
  const paramFileId = searchParams.get("fileId");

  console.log(coockieSessionId);

  const [color, setColor] = useState<string>("#000");
  const { canvasRef, onMouseDown, clear, onTouchStart } = useDraw(createLine);
  const [text, setText] = useState('');
  // const [mode, setMode] = useState('draw');

  const [fileInfo, setFileInfo] = useState<FilewithUser>({
    id: paramFileId,
  });
  const [userId, setUserId] = useState(coockieUserId);

  useEffect(() => {
    if (coockieUserId == null || paramFileId == null)
      return console.log("Terjadi kesalahan");
    getFileInfo(coockieUserId, paramFileId);
  }, [coockieUserId, paramFileId]);

  useEffect(() => {
    if (fileInfo.fileName) {
      // socket = io("http://localhost:3001");
      fetch("/api/socket?fileId=" + fileInfo.id);
      socket = io();

      // socket.on("connect", () => {
      //   socket.emit("user_id", userId);
      //   // socket.emit("fileInfo", fileInfo);
      //   setCookie("sessionId", socket.id);
      //   console.log("connected");
      // });

      const ctx = canvasRef.current?.getContext("2d");

      const img = new Image();
      img.src = fileInfo.data;
      img.onload = () => {
        ctx?.drawImage(img, 0, 0);
      };

      socket.emit("client-ready", { fileInfo });

      socket.on("get-canvas-state", () => {
        if (!canvasRef.current?.toDataURL()) return;
        console.log("sending canvas state");
        socket.emit("canvas-state", {
          fileInfo,
          data: canvasRef.current.toDataURL(),
        });
      });

      socket.on("user-state-from-server", (state) => {
        moveCursorToPosition(state);
      });

      socket.on("canvas-state-from-server", (state: string) => {
        console.log("I received the state");
        const img = new Image();
        img.src = state;
        img.onload = () => {
          ctx?.drawImage(img, 0, 0);
        };
      });

      socket.on(
        "draw-line",
        ({ prevPoint, currentPoint, color }: DrawLineProps) => {
          if (!ctx) return console.log("no ctx here");
          drawLine({ prevPoint, currentPoint, ctx, color });
        }
      );

      document
        .getElementById("draw-canvas")
        .addEventListener("mousemove", handleMouseMove);

      var sendMousePosition_throttled = _.throttle(sendMousePosition, 50);

      function handleMouseMove(event) {
        sendMousePosition_throttled(event);
      }

      function sendMousePosition(event) {
        socket.emit("mousemove", {
          fileId: fileInfo.id,
          data: {
            userId: userId,
            name: coockieUsername,
            x: event.clientX,
            y: event.clientY,
            x_pct: ((event.layerX / event.view.screen.width) * 100).toFixed(3),
            y_pct: ((event.layerY / event.view.screen.height) * 100).toFixed(3),
          },
        });
      }

      //On mouse movement, using throttling, send mouse position via socket.io

      socket.on("clear", clear);
      return () => {
        socket.removeAllListeners("draw-line");
        socket.removeAllListeners("get-canvas-state");
        socket.removeAllListeners("canvas-state-from-server");
        socket.removeAllListeners("user-state-from-server");
        socket.removeAllListeners("clear");
        socket.disconnect();
      };
    }
  }, [canvasRef, fileInfo.fileName]);


  async function getFileInfo(userId: String, fileId: String) {
    const response = await fetch(
      "/api/file?userId=" + userId + "&fileId=" + fileId,
      {
        method: "GET",
      }
    );
    // Handle response if necessary
    const data: FilewithUser = await response.json();
    if (data) {
      setFileInfo(data);
    } else {
      console.log("Anda tidak memiliki izin");
    }
  }

  async function saveFile() {
    var image = canvasRef.current.toDataURL("image/png");

    const response = await fetch("/api/save", {
      method: "POST",
      body: JSON.stringify({
        fileId: fileInfo.id,
        dataFile: image,
      }),
    });

    if (response.status == 200) {
      (document.getElementById("pesan") as HTMLDialogElement).showModal();
    }
    console.log(response);
    // .replace("image/png", "image/octet-stream");
    // here is the most important part because if you dont replace you will get a DOM 18 exception.

    // window.location.href = image; // it will save locally
  }

  function moveCursorToPosition(data) {
    //Create a div, if it doesn't already exist for this
    if (!document.getElementById("mousePosition-" + data.userId)) {
      var element = document.createElement("div");
      //Set ID, class and style (color based on hash of string)
      element.setAttribute("id", "mousePosition-" + data.userId);
      element.setAttribute("class", "mousePosition");
      element.style.backgroundColor = "#" + intToRGB(hashCode(data.userId));
      //Add to document

      document.getElementById("draw-canvas")!.appendChild(element);
    }

    //Move into position
    element = document.getElementById("mousePosition-" + data.userId);

    if (data.userId != userId) {
      element.innerHTML = `<p> ${data.name}</p>`;
    }
    element.style.backgroundColor = data.color;
    element.style.left = data.x + "px";
    element.style.top = data.y + "px";
  }

  function createLine({ prevPoint, currentPoint, ctx }: Draw) {
    if (socket == null) return;
    socket.emit("draw-line", {
      fileId: fileInfo.id,
      data: { prevPoint, currentPoint, color },
    });
    drawLine({ prevPoint, currentPoint, ctx, color });
  }

  async function onAddUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/file", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        newUserId: formData.get("id_user"),
        fileId: fileInfo.id,
        userId: userId,
      }),
    });

    if (response.status == 200) {
      getFileInfo(coockieUserId, paramFileId);
    }
  }

  //Helper functions for setting a color from a string
  function hashCode(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash;
  }

  function intToRGB(i) {
    var c = (i & 0x00ffffff).toString(16).toUpperCase();
    return "00000".substring(0, 6 - c.length) + c;
  }

  function textChangeHandler(event: ChangeEvent) {
    event.preventDefault();
    setText((event.target as HTMLTextAreaElement).value);
  }

  function formTextSubmitHandler(event: FormEvent) {
    event.preventDefault();

    const draggable = document.getElementById('text-draggable-container');
    draggable.innerText = event.target.inputText.value;
    
    document.onmousemove = (e)=>{
      draggable.style.position = 'fixed';
      draggable.style.top = e.pageX - canvasRef.current!.offsetTop;
    }
  }

  useEffect(() => {
    let mouseX = 0;
    let mouseY = 0;
    let startingX = 0;

    const context = canvasRef.current?.getContext('2d');

    canvasRef.current?.addEventListener('click', (event) => {
      mouseX = event.pageX - canvasRef.current!.offsetLeft;
      mouseY = event.pageY - canvasRef.current!.offsetTop;
      startingX = mouseX;
    });

    document.addEventListener('keydown', (event) => {
      context!.font = '16px Arial'
      context!.fillText(event.key, mouseX, mouseY);
      mouseX += context!.measureText(event.key).width;
    });

    // let draggableElem: HTMLElement = document.getElementById('text-draggable-container')!;
    
    // document.addEventListener('mousemove', (e)=>{
    //   draggableElem.style.left = e.pageX + 'px';
    //   draggableElem.style.top = e.pageY + 'px';
    // });
  }, []);


  return (
    <div id="draw-canvas" className="w-[1800px] h-[1800px]">
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        width={1800}
        height={1800}
        className=" bg-white absolute border border-black rounded-md"
      >
      </canvas>
      <dialog id="pesan" className="modal">
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
        <div className="modal-box">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
              ✕
            </button>
          </form>
          <h3 className="font-bold text-lg">Data Berhasil Disimpan</h3>
        </div>
      </dialog>

      <dialog id="add_user_modal" className="modal">
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
        <div className="modal-box">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
              ✕
            </button>
          </form>
          <h3 className="font-bold text-lg">Hello!</h3>
          <p className="py-4">Masukkan Id user</p>

          <form onSubmit={onAddUser}>
            <input
              type="text"
              placeholder="ID User"
              name="id_user"
              className="input input-bordered input-sm w-full"
            />
            <div className="modal-action">
              {/* if there is a button in form, it will close the modal */}
              <button className="btn" type="submit">
                Simpan
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog id="teks-dialog" className="modal">
        <div className="modal-box">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
              ✕
            </button>
          </form>
          <h1>Masukkan teks</h1>
          <br />
          <form className="w-full flex flex-col items-end gap-[10px]" onSubmit={formTextSubmitHandler}>
            <input value={text} name="inputText" onChange={textChangeHandler} required className="p-2 rounded-md outline-none border border-black w-full" type="text" placeholder="masukkan teks" />
            <button className="btn">tambah</button>
          </form>
        </div>
      </dialog>

      <div draggable={true} id="text-draggable-container" className="absolute top-[50vh] left-[900px] z-[100] w-[100px] h-[100px] bg-red-500">
        <p>{text}</p>
      </div>

      <div className="fixed w-fit top-5 left-5 flex flex-col gap-2 z-10 bg-gray-200 rounded-md p-4">
        <div className=" flex flex-row justify-start  gap-2 pb-2">
          <input
            type="text"
            className="w-52 p-1 border border-green-600 rounded-lg"
            placeholder="Save file as..."
            value={fileInfo.fileName}
          />
          <button type="button" onClick={saveFile}>
            <IoDocumentText className="text-green-600 border-green-800  hover:text-white hover:bg-green-400 w-fit h-fit p-2 rounded-md border " />
          </button>
        </div>
        <TwitterPicker
          color={color}
          onChange={(e) => {
            setColor(e.hex);
          }}
        />
        <div className="flex flex-row gap-3">
          <div className="flex flex-col gap-2 max-w-[50%]">
            <div className="flex flex-row gap-3  w-fit">
              <button
                type="button"
                className="text-red-600 border-red-800  hover:text-white hover:bg-red-400 w-fit h-fit p-2 rounded-md border "
                onClick={() => socket.emit("clear", { fileInfo })}
              >
                <IoTrashBin />
              </button>
              <button
                type="button"
                className="text-blue-600 border-blue-800  hover:text-white hover:bg-blue-400 w-fit h-fit p-2 rounded-md border "
              >
                <IoPencil />
              </button>
              <button
                type="button"
                className="text-gray-600 border-gray-800  hover:text-white hover:bg-gray-400 w-fit h-fit p-2 rounded-md border "
                onClick={() => {
                  (document.getElementById("teks-dialog") as HTMLDialogElement).showModal();
                }}
              >
                <IoText />
              </button>
            </div>
            <div className="flex flex-row gap-2  w-fit">
              <div className="rounded-lg bg-gray-400 py-1 px-5 w-fit"> Users </div>
              <button
                type="button"
                className="text-yellow-600 border-yellow-800  hover:text-white hover:bg-yellow-400 w-fit h-fit p-2 rounded-md border "
                onClick={() =>
                  (document.getElementById("add_user_modal") as HTMLDialogElement).showModal()
                }
              >
                <IoAdd />
              </button>
            </div>
            <div className="flex flex-row gap-3  w-fit">
              {fileInfo.user?.map((user) => (
                <div
                  key={user.id}
                  className="avatar placeholder tooltip"
                  data-tip={user.name}
                >
                  <div
                    id={`avatar-${user.id}`}
                    className="bg-neutral text-neutral-content rounded-full w-12"
                  >
                    <span>{user.name[0].toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 border w-[50%] rounded-[10px] border-black">
            <h1>Shape</h1>
            <div id="shape-box" className="flex flex-row w-fit gap-2">
              <button className="hover:text-yellow-800 w-fit h-fit">
                <BsSquare className="cursor-pointer" />
              </button>
              <button className="hover:text-yellow-800 w-fit h-fit">
                <BsCircle className="cursor-pointer" />
              </button>
              <button className="hover:text-yellow-800 w-fit h-fit">
                <BsTriangle className="cursor-pointer" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
